import * as React from 'react';
import { useAuth } from '../hooks/useAuth';
import { useDarkMode } from '../hooks/useDarkMode';
import { useConfirmDialogPromise } from '../hooks/useConfirmDialogPromise';
import { apiClient } from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { ScrollArea } from '../components/ui/scroll-area';
import { Avatar, AvatarFallback } from '../components/ui/avatar';
import { Send, MoreVertical, ChevronDown, Plus, Ghost, Download, Clipboard, MessageCircle, Trash2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { UserMessage } from './chat-messages/UserMessage';
import { AssistantMessage } from './chat-messages/AssistantMessage';
import { ToolUseMessage } from './chat-messages/ToolUseMessage';
import { LLMCallMessage } from './chat-messages/LLMCallMessage';
import { ToolCallMessage } from './chat-messages/ToolCallMessage';
import { MessageRecord } from '../../../bernard/lib/conversation/types';
import { ThinkingMessage } from './chat-messages/ThinkingMessage';
import { useToast } from './ToastManager';
import { parseTraceChunk, updateTraceEventWithCompletion } from '../utils/traceEventParser';

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface TraceEvent {
  id: string;
  type: 'llm_call' | 'tool_call';
  data: any;
  timestamp: Date;
  status: 'loading' | 'completed';
  result?: any;
}

interface ChatInterfaceProps {
  initialMessages?: MessageRecord[];
  initialTraceEvents?: TraceEvent[];
  readOnly?: boolean;
  height?: string;
}

export function ChatInterface({ initialMessages = [], initialTraceEvents = [], readOnly = false, height = "h-screen" }: ChatInterfaceProps = {}) {
  const isAutoHeight = height === "h-auto";
  const { state } = useAuth();
  const { isDarkMode } = useDarkMode();
  const [messages, setMessages] = React.useState<MessageRecord[]>(initialMessages);
  const [traceEvents, setTraceEvents] = React.useState<TraceEvent[]>(initialTraceEvents);
  const [input, setInput] = React.useState('');
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [isInputFocused, setIsInputFocused] = React.useState(false);
  const [showToolDetails, setShowToolDetails] = React.useState<Record<string, boolean>>({});
  const [currentConversationId, setCurrentConversationId] = React.useState<string | null>(null);
  const [isGhostMode, setIsGhostMode] = React.useState(false);
  const scrollAreaRef = React.useRef<HTMLDivElement>(null);
  
  // Buffer for streaming tool call arguments
  const toolCallBufferRef = React.useRef<Record<string, string>>({});
  
  // Store current assistant message ID for cleanup
  const currentAssistantIdRef = React.useRef<string | null>(null);
  
  // Hook calls - must be at the top level of the component function
  const toast = useToast();
  const confirmDialog = useConfirmDialogPromise();

  // Handle input focus/blur with content check
  const handleInputFocus = () => {
    setIsInputFocused(true);
  };

  const handleInputBlur = () => {
    // Only blur if there's no content
    if (!input.trim()) {
      setIsInputFocused(false);
    }
  };

  // Auto-scroll to bottom when messages change
  React.useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);


  const handleSendMessage = async () => {
    if (!input.trim() || isStreaming) return;

    const userMessage: MessageRecord = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      createdAt: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsStreaming(true);

    try {
      const stream = await apiClient.chatStream(
        messages.concat(userMessage).filter(msg => msg.role !== 'system').map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
        })),
        isGhostMode
      );

      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantMessage: MessageRecord | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf('\n\n');

        while (boundary !== -1) {
          const raw = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          
          // Extract data payload - remove "data: " prefix if present
          let payload = raw;
          if (raw.startsWith('data: ')) {
            payload = raw.substring(6).trim();
          }

          if (!payload || payload === '[DONE]') {
            break;
          }

          try {
            const chunk = JSON.parse(payload);

            // Handle Bernard trace chunks (llm_call, tool_call events)
            if (chunk.bernard && chunk.bernard.type === 'trace') {
              const traceData = chunk.bernard.data;

              if (traceData.type === 'llm_call_complete' || traceData.type === 'tool_call_complete') {
                // Update trace events with completion data
                setTraceEvents(prev => updateTraceEventWithCompletion(prev, traceData));
              } else {
                // Handle new trace events
                const traceEvents = parseTraceChunk(traceData);
                for (const traceEvent of traceEvents) {
                  setTraceEvents(prev => [...prev, traceEvent]);
                }
              }
            }

            // Handle OpenAI-compatible tool calls (legacy format)
            if (chunk.choices && chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.tool_calls) {
              const toolCalls: ToolCall[] = chunk.choices[0].delta.tool_calls;

              for (const toolCall of toolCalls) {
                try {
                  // Handle streaming tool call arguments
                  const toolArgs = parseToolCallArguments(toolCall.function.arguments, toolCall.id);

                  // Only create message if we have valid arguments
                  if (toolArgs !== null) {
                    // Create tool use message
                    const toolUseMessage: MessageRecord = {
                      id: `tool-${toolCall.id}`,
                      role: 'tool',
                      content: {
                        toolName: toolCall.function.name,
                        arguments: toolArgs,
                        toolUseId: toolCall.id,
                        status: 'in-progress'
                      },
                      createdAt: new Date().toISOString()
                    };

                    // Insert tool message above the thinking message (if streaming)
                    setMessages(prev => {
                      if (isStreaming) {
                        // Find the last assistant message (thinking message placeholder)
                        const lastAssistantIndex = prev.map(msg => msg.role).lastIndexOf('assistant');
                        if (lastAssistantIndex !== -1) {
                          const newMessages = [...prev];
                          newMessages.splice(lastAssistantIndex, 0, toolUseMessage);
                          return newMessages;
                        }
                      }
                      return [...prev, toolUseMessage];
                    });
                  }
                } catch (parseError) {
                  console.error('Failed to parse tool call arguments:', parseError);
                }
              }
            }
            
            // Handle regular text content and role deltas
            const text = extractTextFromChunk(chunk);
            const hasRole = chunk.choices?.[0]?.delta?.role === 'assistant';

            if (text || hasRole) {
              // Create assistant message if it doesn't exist yet
              if (!assistantMessage) {
                assistantMessage = {
                  id: `assistant-${Date.now()}`,
                  role: 'assistant',
                  content: text || '',
                  createdAt: new Date().toISOString()
                };
                // Store current assistant message ID for cleanup
                currentAssistantIdRef.current = assistantMessage.id;
                setMessages(prev => [...prev, assistantMessage!]);
              } else if (text && assistantMessage) {
                // Only append text if assistant message already exists (avoid duplicating first token)
                const updatedMessage: MessageRecord = {
                  ...assistantMessage,
                  content: assistantMessage.content + text
                };
                assistantMessage = updatedMessage;

                setMessages(prev => {
                  // Update the assistant message in place
                  const updatedMessages = prev.map(msg =>
                    msg.id === updatedMessage.id ? updatedMessage : msg
                  );

                  // If streaming and assistant message is not at the end, move it to the end
                  if (isStreaming && updatedMessages.length > 0 &&
                      updatedMessages[updatedMessages.length - 1].id !== updatedMessage.id) {
                    // Remove the assistant message from its current position
                    const filteredMessages = updatedMessages.filter(msg => msg.id !== updatedMessage.id);
                    // Add it back at the end
                    return [...filteredMessages, updatedMessage];
                  }

                  return updatedMessages;
                });
              }
            }
          } catch {
            // Ignore malformed chunks
          }
          
          boundary = buffer.indexOf('\n\n');
        }
      }
    } catch (err) {
      console.error('Chat error:', err);
      toast.error('Chat Error', err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      // Clear tool call buffers when stream ends
      toolCallBufferRef.current = {};

      // Move assistant message to the end after all tool messages
      const assistantId = currentAssistantIdRef.current;
      if (assistantId) {
        setMessages(prev => {
          const idx = prev.findIndex(msg => msg.id === assistantId);
          if (idx !== -1 && idx !== prev.length - 1) {
            const msg = prev[idx];
            return [...prev.slice(0, idx), ...prev.slice(idx + 1), msg];
          }
          return prev;
        });
        currentAssistantIdRef.current = null;
      }

      setIsStreaming(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const extractTextFromChunk = (chunk: any): string | null => {
    const choice = chunk.choices?.[0];
    if (!choice) return null;

    const deltaContent = choice.delta?.content;
    if (typeof deltaContent === 'string') return deltaContent;

    const messageContent = choice.message?.content;
    if (typeof messageContent === 'string') return messageContent;

    return null;
  };

  // Parse streaming tool call arguments with proper buffering
  const parseToolCallArguments = (argumentsChunk: string, toolCallId: string): any => {
    if (!argumentsChunk) return null;
    
    // Initialize buffer for this tool call if not exists
    if (!toolCallBufferRef.current[toolCallId]) {
      toolCallBufferRef.current[toolCallId] = '';
    }
    
    // Append chunk to buffer
    toolCallBufferRef.current[toolCallId] += argumentsChunk;
    
    const buffer = toolCallBufferRef.current[toolCallId];
    
    try {
      // Try to parse the current buffer
      const parsed = JSON.parse(buffer);
      // If successful, clear the buffer for this tool call
      toolCallBufferRef.current[toolCallId] = '';
      return parsed;
    } catch (error) {
      // If parsing fails, check if we have a partial JSON object
      if (buffer.trim().endsWith(',') || buffer.trim().endsWith(':')) {
        // Partial object, keep buffering
        return null;
      }
      
      // Try to extract a valid JSON object from the buffer
      const trimmed = buffer.trim();
      let openBraces = 0;
      let closeBraces = 0;
      let openBrackets = 0;
      let closeBrackets = 0;
      
      for (let i = 0; i < trimmed.length; i++) {
        const char = trimmed[i];
        if (char === '{') openBraces++;
        else if (char === '}') closeBraces++;
        else if (char === '[') openBrackets++;
        else if (char === ']') closeBrackets++;
        
        // If we have balanced braces and brackets, try to parse up to this point
        if (openBraces === closeBraces && openBrackets === closeBrackets && openBraces > 0) {
          try {
            const partial = trimmed.substring(0, i + 1);
            const parsed = JSON.parse(partial);
            // Update buffer to start after the parsed object
            toolCallBufferRef.current[toolCallId] = trimmed.substring(i + 1);
            return parsed;
          } catch {
            // Continue searching
          }
        }
      }
      
      // If we can't parse anything, return null to keep buffering
      return null;
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const toggleToolDetails = (messageId: string) => {
    setShowToolDetails(prev => ({
      ...prev,
      [messageId]: !prev[messageId]
    }));
  };

  const handleNewChat = async () => {
    // Check if there are unsaved messages
    const hasUnsavedMessages = messages.length > 0;

    if (hasUnsavedMessages) {
      const confirmed = await confirmDialog({
        title: 'Start New Chat',
        description: 'Starting a new chat will clear the current conversation. Any unsaved messages will be lost.',
        confirmText: 'Start New Chat',
        cancelText: 'Cancel',
        confirmVariant: 'default'
      });

      if (!confirmed) return;
    }

    // If there's a current conversation, close it before starting a new one
    if (currentConversationId) {
      try {
        // Close the current conversation
        await apiClient.closeConversation(currentConversationId, 'manual');
      } catch (error) {
        console.error('Failed to close conversation:', error);
        // Continue anyway - we still want to start a new chat
      }
    }

    // Clear local state for new chat
    setMessages([]);
    setTraceEvents([]);
    setCurrentConversationId(null);
    setIsGhostMode(false); // Reset ghost mode for new chat
  };

  const handleToggleGhostMode = async () => {
    const newGhostMode = !isGhostMode;

    // If we have a current conversation, update it via API
    if (currentConversationId) {
      try {
        await apiClient.updateConversationGhostStatus(currentConversationId, newGhostMode);
      } catch (error) {
        console.error('Failed to toggle ghost mode:', error);
        // Could show a toast here
        return;
      }
    }

    // Update local state
    setIsGhostMode(newGhostMode);
  };

  // Calculate how many tool calls were initiated by each LLM call
  const getToolCallCountForLLMCall = (llmCallIndex: number) => {
    let count = 0;
    // Count tool_call events after this LLM call until the next llm_call
    for (let i = llmCallIndex + 1; i < traceEvents.length; i++) {
      const event = traceEvents[i];
      if (event.type === 'llm_call') {
        // Stop when we reach the next LLM call
        break;
      }
      if (event.type === 'tool_call') {
        count++;
      }
    }
    return count;
  };

  const handleDeleteChat = async () => {
    // Admin only
    if (!currentConversationId) {
      toast.error('No Chat', 'No active conversation to delete');
      return;
    }

    const confirmed = await confirmDialog({
      title: 'Delete Conversation',
      description: 'Are you sure you want to permanently delete this conversation? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmVariant: 'destructive'
    });

    if (!confirmed) return;

    try {
      await apiClient.deleteConversation(currentConversationId);
      toast.success('Success', 'Conversation deleted successfully');
      // Clear local state
      setMessages([]);
      setTraceEvents([]);
      setCurrentConversationId(null);
      setIsGhostMode(false);
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      toast.error('Delete Failed', error instanceof Error ? error.message : 'Failed to delete conversation');
    }
  };

  const handleCopyChatHistory = async () => {
    try {
      let historyData;
      
      // Try to fetch current conversation history from the API first
      try {
        const apiResponse = await apiClient.getConversationHistory(1000, true, currentConversationId);
        // API returns an array of conversations, we need to extract the relevant one
        if (apiResponse && apiResponse.length > 0) {
          // If we have a current conversation ID, find it; otherwise use the first
          if (currentConversationId) {
            const found = apiResponse.find(conv => conv.id === currentConversationId);
            if (found) {
              historyData = found.messages || [];
            }
          } else {
            // Use the most recent conversation
            historyData = apiResponse[0].messages || [];
          }
        }
      } catch (apiError) {
        console.warn('Could not fetch full history from API, using current messages:', apiError);
      }
      
      // Fallback to current messages if API didn't return history
      if (!historyData || historyData.length === 0) {
        historyData = messages;
      }
      
      // If still no messages, show error
      if (!historyData || historyData.length === 0) {
        toast.error('No History', 'No chat history available to copy');
        return;
      }

      // Copy chat history JSON
      const jsonContent = JSON.stringify(historyData, null, 2);
      await navigator.clipboard.writeText(jsonContent);
      
      // Show success toast
      toast.success('Success', 'Chat history copied to clipboard!');
      
    } catch (err) {
      console.error('Failed to copy chat history:', err);
      toast.error('Copy Failed', err instanceof Error ? err.message : 'Failed to copy chat history');
    }
  };

  const handleDownloadChatHistory = async () => {
    try {
      let historyData;
      
      // Try to fetch current conversation history from the API first
      try {
        historyData = await apiClient.getConversationHistory(1000, true, currentConversationId);
      } catch (apiError) {
        console.warn('Could not fetch full history from API, using current messages:', apiError);
      }
      
      // Fallback to current messages if API didn't return history
      if (!historyData || historyData.length === 0) {
        historyData = messages;
      }
      
      // If still no messages, show error
      if (!historyData || historyData.length === 0) {
        toast.error('No History', 'No chat history available to download');
        return;
      }

      // Download COMPLETE HISTORY JSON OBJECT - NO PARSING
      const jsonContent = JSON.stringify(historyData, null, 2);
      const blob = new Blob([jsonContent], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bernard-chat-history-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
    } catch (err) {
      console.error('Failed to download chat history:', err);
      toast.error('Download Failed', err instanceof Error ? err.message : 'Failed to download chat history');
    }
  };

  return (
    <div className={`flex flex-col ${height} ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      {/* Header with model selector and menu - hidden in read-only mode */}
      {!readOnly && (
        <div className={`flex items-center justify-between p-4 border-b ${isDarkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
        <div className="flex items-center space-x-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback>B</AvatarFallback>
          </Avatar>
          <div className="flex items-center space-x-1">
            <span className="font-medium">Bernard</span>
            {isGhostMode && <Ghost className="h-4 w-4 text-gray-500" />}
            <ChevronDown className="h-4 w-4 text-gray-500" />
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {state.user ? `Logged in as ${state.user.displayName}` : 'Not logged in'}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleNewChat}>
                <Plus className="mr-2 h-4 w-4" />
                New Chat
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleCopyChatHistory}>
                <Clipboard className="mr-2 h-4 w-4" />
                Copy Chat History
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDownloadChatHistory}>
                <Download className="mr-2 h-4 w-4" />
                Download Chat History
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleToggleGhostMode}>
                <Ghost className="mr-2 h-4 w-4" />
                {isGhostMode ? 'Disable' : 'Enable'} Ghost Mode
              </DropdownMenuItem>
              {state.user?.isAdmin && (
                <DropdownMenuItem onClick={handleDeleteChat}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Chat
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      )}

      {/* Main chat area */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="max-w-3xl mx-auto w-full flex flex-col h-full">
          {(() => {
            const content = messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full">
                {isGhostMode ? (
                  <Ghost className={`h-16 w-16 mb-4 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                ) : (
                  <MessageCircle className={`h-16 w-16 mb-4 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                )}
                <div className={`text-center ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  <h3 className="text-lg font-medium mb-2">How can I help you today?</h3>
                  <p className="text-sm">Ask about the weather, set a timer, or search the web.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Render messages and trace events in chronological order */}
                {(() => {
                  // Combine messages and trace events, sorted by timestamp
                  const allItems = [
                    ...messages.map(msg => ({ type: 'message' as const, item: msg, timestamp: new Date(msg.createdAt) })),
                    ...traceEvents.map(event => ({ type: 'trace' as const, item: event, timestamp: event.timestamp }))
                  ].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

                  return allItems.map(({ type, item }) => {
                    if (type === 'message') {
                      const message = item as MessageRecord;
                      return (
                        <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          {message.role === 'assistant' && (
                            <div className="w-8 flex justify-center">
                              {isGhostMode ? (
                                <Ghost className="h-8 w-8 text-gray-500" />
                              ) : (
                                <Avatar className="h-8 w-8">
                                  <AvatarFallback>B</AvatarFallback>
                                </Avatar>
                              )}
                            </div>
                          )}
                          {message.role === 'user' ? (
                            <UserMessage
                              content={typeof message.content === 'string' ? message.content : JSON.stringify(message.content)}
                            />
                          ) : message.role === 'tool' ? (
                            <ToolUseMessage
                              toolName={typeof message.content === 'object' && message.content ? (message.content as any).toolName || '' : ''}
                              arguments={typeof message.content === 'object' && message.content ? (message.content as any).arguments || {} : {}}
                              status={typeof message.content === 'object' && message.content ? (message.content as any).status || 'in-progress' : 'in-progress'}
                              response={typeof message.content === 'object' && message.content ? (message.content as any).response || '' : ''}
                              error={typeof message.content === 'object' && message.content ? (message.content as any).error || '' : ''}
                            />
                          ) : (
                            <AssistantMessage
                              content={typeof message.content === 'string' ? message.content : JSON.stringify(message.content)}
                              toolsUsed={[]}
                              showToolDetails={showToolDetails[message.id]}
                              onCopy={() => copyToClipboard(typeof message.content === 'string' ? message.content : JSON.stringify(message.content))}
                              onToggleToolDetails={() => toggleToolDetails(message.id)}
                            />
                          )}
                          {message.role === 'user' && (
                            <div className="w-8 flex justify-center">
                              <Avatar className="h-8 w-8 bg-blue-500">
                                <AvatarFallback className="text-white">
                                  {state.user ? state.user.displayName.charAt(0).toUpperCase() : 'U'}
                                </AvatarFallback>
                              </Avatar>
                            </div>
                          )}
                        </div>
                      );
                    } else {
                      const traceEvent = item as TraceEvent;
                      const traceEventIndex = traceEvents.findIndex(te => te.id === traceEvent.id);
                      return (
                        <div key={traceEvent.id} className="flex justify-start">
                          <div className="flex-1 ml-12">
                            {traceEvent.type === 'llm_call' ? (
                              <LLMCallMessage
                                model={traceEvent.data?.model}
                                context={traceEvent.data?.context || []}
                                tools={traceEvent.data?.tools}
                                toolCallCount={getToolCallCountForLLMCall(traceEventIndex)}
                                status={traceEvent.status}
                                result={traceEvent.result}
                                totalContextTokens={traceEvent.data?.totalContextTokens}
                                actualTokens={traceEvent.result?.actualTokens}
                              />
                            ) : traceEvent.type === 'tool_call' ? (
                              <ToolCallMessage
                                toolCall={traceEvent.data?.toolCall || { id: '', function: { name: 'Unknown', arguments: '{}' } }}
                                status={traceEvent.status}
                                result={traceEvent.result}
                              />
                            ) : (
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {traceEvent.type}: {JSON.stringify(traceEvent.data)}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }
                  });
                })()}
                {isStreaming && (
                  <div className="flex justify-start">
                    <div className="w-8 flex justify-center">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>B</AvatarFallback>
                      </Avatar>
                    </div>
                    <div className="">
                      <ThinkingMessage />
                    </div>
                  </div>
                )}
              </div>
            );

            return isAutoHeight ? (
              <div className="flex-1 p-4">
                {content}
              </div>
            ) : (
              <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
                {content}
              </ScrollArea>
            );
          })()}

          {/* Chat input area - hidden in read-only mode */}
          {!readOnly && (
            <div className={`${isInputFocused || input.trim() ? 'rounded-3xl' : 'rounded-full'} ${isDarkMode ? 'bg-gray-800' : 'bg-white'} my-2`}>
              {isInputFocused ? (
                <div className="flex flex-col p-2">
                  {/* First row: transparent input */}
                  <Input
                    placeholder="Type your message..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                    disabled={isStreaming}
                    className="flex-1 min-h-[44px] bg-transparent border-none without-ring"
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                    autoFocus
                  />
                  {/* Second row: + button and send button */}
                  <div className="flex justify-between">
                    <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                      <Plus className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleSendMessage}
                      disabled={!input.trim() || isStreaming}
                      className="h-8 w-8 flex-shrink-0"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center h-11 px-2 ">
                  <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Input
                    placeholder="Type your message..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                    disabled={isStreaming}
                    className="flex-1 min-h-[44px] bg-transparent border-none without-ring"
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleSendMessage}
                    disabled={!input.trim() || isStreaming}
                    className="h-8 w-8 flex-shrink-0"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}