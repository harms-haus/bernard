import * as React from 'react';
import { useAuth } from '../hooks/useAuth';
import { useDarkMode } from '../hooks/useDarkMode';
import { apiClient, ConversationMessage } from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { ScrollArea } from '../components/ui/scroll-area';
import { Avatar, AvatarFallback } from '../components/ui/avatar';
import { Send, Loader2, Copy, RefreshCw, MoreVertical, ChevronDown, Plus, Ghost, Download, Clipboard } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { UserMessage } from './chat-messages/UserMessage';
import { AssistantMessage } from './chat-messages/AssistantMessage';
import { ToolUseMessage } from './chat-messages/ToolUseMessage';

interface ToolUse {
  toolName: string;
  arguments: Record<string, any>;
  toolUseId: string;
  status: 'in-progress' | 'success' | 'failure';
  response?: string;
  error?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'tool-use';
  content?: string;
  toolsUsed?: string[];
  toolUse?: ToolUse;
  toolResponse?: {
    toolUseId: string;
    content?: string;
    error?: string;
  };
}

export function ChatInterface() {
  const { state } = useAuth();
  const { isDarkMode } = useDarkMode();
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input, setInput] = React.useState('');
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isInputFocused, setIsInputFocused] = React.useState(false);
  const [showToolDetails, setShowToolDetails] = React.useState<Record<string, boolean>>({});
  const [currentConversationId, setCurrentConversationId] = React.useState<string | null>(null);
  const scrollAreaRef = React.useRef<HTMLDivElement>(null);

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

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setError(null);
    setIsStreaming(true);

    try {
      const stream = await apiClient.chatStream(
        messages.concat(userMessage).map(msg => ({
          role: msg.role === 'tool-use' ? 'assistant' : msg.role,
          content: msg.content || ''
        }))
      );

      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: ''
      };

      setMessages(prev => [...prev, assistantMessage]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf('\n\n');

        while (boundary !== -1) {
          const raw = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          
          const lines = raw.split('\n').filter((line) => line.startsWith('data:'));
          const payload = lines.map((line) => line.replace(/^data:\s*/, '')).join('');

          if (!payload || payload === '[DONE]') {
            break;
          }

          try {
            const chunk = JSON.parse(payload);
            const text = extractTextFromChunk(chunk);
            if (text) {
              assistantMessage = {
                ...assistantMessage,
                content: assistantMessage.content + text
              };
              
              setMessages(prev => {
                const updated = [...prev];
                const lastIndex = updated.length - 1;
                updated[lastIndex] = assistantMessage;
                return updated;
              });
            }
          } catch {
            // Ignore malformed chunks
          }
          
          boundary = buffer.indexOf('\n\n');
        }
      }
    } catch (err) {
      console.error('Chat error:', err);
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setIsStreaming(false);
    }
  };

  const handleStopStreaming = () => {
    setIsStreaming(false);
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const toggleToolDetails = (messageId: string) => {
    setShowToolDetails(prev => ({
      ...prev,
      [messageId]: !prev[messageId]
    }));
  };

  const handleNewChat = () => {
    setMessages([]);
    setCurrentConversationId(null);
  };

  const handlePrivateChat = () => {
    // Admin only - mock implementation
    setMessages([]);
  };

  const handleDeleteChat = () => {
    // Admin only - mock implementation
    setMessages([]);
  };

  const handleCopyChatHistory = async () => {
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
        setError('No chat history available to copy');
        return;
      }

      // Copy COMPLETE HISTORY JSON OBJECT - NO PARSING
      const jsonContent = JSON.stringify(historyData, null, 2);
      await navigator.clipboard.writeText(jsonContent);
      setError('Chat history copied to clipboard!');
      
      // Clear the success message after 3 seconds
      setTimeout(() => {
        setError(null);
      }, 3000);
      
    } catch (err) {
      console.error('Failed to copy chat history:', err);
      setError(err instanceof Error ? err.message : 'Failed to copy chat history');
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
        setError('No chat history available to download');
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
      setError(err instanceof Error ? err.message : 'Failed to download chat history');
    }
  };

  return (
    <div className={`flex flex-col h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      {/* Header with model selector and menu */}
      <div className={`flex items-center justify-between p-4 border-b ${isDarkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
        <div className="flex items-center space-x-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback>B</AvatarFallback>
          </Avatar>
          <div className="flex items-center space-x-1">
            <span className="font-medium">Bernard</span>
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
              {state.user?.isAdmin && (
                <>
                  <DropdownMenuItem onClick={handlePrivateChat}>
                    Private Chat
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleDeleteChat}>
                    Delete Chat
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="max-w-3xl mx-auto w-full flex flex-col h-full">
          <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full">
                <Ghost className={`h-16 w-16 mb-4 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                <div className={`text-center ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  <h3 className="text-lg font-medium mb-2">How can I help you today?</h3>
                  <p className="text-sm">Ask about the weather, set a timer, or search the web.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map((message) => (
                  <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {message.role === 'assistant' && (
                      <div className="w-8 flex justify-center">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback>B</AvatarFallback>
                        </Avatar>
                      </div>
                    )}
                    {message.role === 'user' ? (
                      <UserMessage
                        content={message.content || ''}
                      />
                    ) : message.role === 'tool-use' && message.toolUse ? (
                      <ToolUseMessage
                        toolName={message.toolUse.toolName}
                        arguments={message.toolUse.arguments}
                        toolUseId={message.toolUse.toolUseId}
                        status={message.toolUse.status}
                        response={message.toolUse.response}
                        error={message.toolUse.error}
                      />
                    ) : (
                      <AssistantMessage
                        content={message.content || ''}
                        toolsUsed={message.toolsUsed}
                        showToolDetails={showToolDetails[message.id]}
                        onCopy={() => copyToClipboard(message.content || '')}
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
                ))}
                {isStreaming && (
                  <div className="flex justify-start">
                    <div className="w-8 flex justify-center">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>B</AvatarFallback>
                      </Avatar>
                    </div>
                    <div className="">
                      <div className="flex items-center space-x-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Thinking...</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>

          {/* Chat input area */}
          <div className={`${isInputFocused || input.trim() ? 'rounded-3xl' : 'rounded-full'} ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
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
              <div className="flex items-center h-11 px-2">
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
          {error && (
            <div className={`mt-2 border border-red-200 text-red-700 px-4 py-2 rounded text-sm ${isDarkMode ? 'bg-red-900/20' : 'bg-red-50'}`}>
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}