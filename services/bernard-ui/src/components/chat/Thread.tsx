import { useState, useEffect, FormEvent, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { useStreamContext } from '../../providers/StreamProvider';
import { useDarkMode } from '../../hooks/useDarkMode';
import { ConversationHistory, useSidebarState } from './ConversationHistory';
import { HumanMessage } from './messages/human';
import { AssistantMessage, AssistantMessageLoading } from './messages/ai';
import { cn } from '../../lib/utils';
import { ensureToolCallsHaveResponses, DO_NOT_RENDER_ID_PREFIX } from '../../lib/ensure-tool-responses';
import { PanelRightOpen, PenSquare, MoreVertical, Ghost, Plus, Copy, Download, Sun, Moon, Send, StopCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { Message, Checkpoint } from '@langchain/langgraph-sdk';

export function Thread() {
  const [searchParams, setSearchParams] = useSearchParams();
  const threadId = searchParams.get('threadId');

  const stream = useStreamContext();
  const { messages, submit, isLoading, stop } = stream;
  const { isDarkMode, toggleDarkMode } = useDarkMode();
  const [sidebarOpen, setSidebarOpen] = useSidebarState();
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const [input, setInput] = useState('');
  const [isGhostMode, setIsGhostMode] = useState(false);
  const [firstTokenReceived, setFirstTokenReceived] = useState(false);
  const prevMessageLength = useRef(0);

  useEffect(() => {
    setInput('');
    setFirstTokenReceived(false);
    prevMessageLength.current = 0;
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [threadId]);

  useEffect(() => {
    if (
      messages.length !== prevMessageLength.current &&
      messages?.length &&
      messages[messages.length - 1].type === 'ai'
    ) {
      setFirstTokenReceived(true);
    }
    prevMessageLength.current = messages.length;
    
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    setFirstTokenReceived(false);

    const newHumanMessage: Message = {
      id: uuidv4(),
      type: 'human',
      content: input.trim(),
    };

    const toolMessages = ensureToolCallsHaveResponses(messages);
    submit(
      { messages: [...toolMessages, newHumanMessage] },
      {
        streamMode: ['values'],
        optimisticValues: (prev: any) => ({
          ...prev,
          messages: [
            ...(prev.messages ?? []),
            ...toolMessages,
            newHumanMessage,
          ],
        }),
      }
    );
    setInput('');
  };

  const handleNewChat = () => {
    setSearchParams({});
  };

  const handleRegenerate = (
    parentCheckpoint: Checkpoint | null | undefined,
  ) => {
    prevMessageLength.current = prevMessageLength.current - 1;
    setFirstTokenReceived(false);
    stream.submit(undefined, {
      checkpoint: parentCheckpoint,
      streamMode: ['values'],
    });
  };

  const handleCopyChatHistory = async () => {
    const historyData = messages.map(msg => ({
      role: msg.type === 'human' ? 'user' : 'assistant',
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
    }));
    await navigator.clipboard.writeText(JSON.stringify(historyData, null, 2));
    toast.success('Chat history copied to clipboard');
  };

  const handleDownloadChatHistory = () => {
    const historyData = messages.map(msg => ({
      role: msg.type === 'human' ? 'user' : 'assistant',
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
    }));
    const blob = new Blob([JSON.stringify(historyData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bernard-chat-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Chat history downloaded');
  };

  const toggleSidebar = () => setSidebarOpen((prev: boolean) => !prev);
  const chatStarted = messages.length > 0;

  return (
    <div className="flex w-full h-screen overflow-hidden bg-background">
      <ConversationHistory />
      
      <motion.div
        className="flex-1 flex flex-col min-w-0"
        animate={{ marginLeft: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        <div className="flex items-center justify-between gap-3 p-2 border-b bg-background/95 backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-2">
            {!sidebarOpen && (
              <Button variant="ghost" size="icon" onClick={toggleSidebar} aria-label="Open chat history">
                <PanelRightOpen className="size-5" />
              </Button>
            )}
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary text-primary-foreground">B</AvatarFallback>
              </Avatar>
              <span className="font-semibold tracking-tight">Bernard</span>
              {isGhostMode && <Ghost className="h-4 w-4 text-muted-foreground" />}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggleDarkMode} aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
              {isDarkMode ? <Sun className="h-4 w-4 text-yellow-500" /> : <Moon className="h-4 w-4" />}
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleNewChat}>
                  <PenSquare className="mr-2 h-4 w-4" />
                  New Chat
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleCopyChatHistory}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Chat History
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDownloadChatHistory}>
                  <Download className="mr-2 h-4 w-4" />
                  Download Chat History
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsGhostMode(!isGhostMode)}>
                  <Ghost className="mr-2 h-4 w-4" />
                  {isGhostMode ? 'Disable' : 'Enable'} Ghost Mode
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div 
          ref={scrollRef}
          className={cn(
            "flex-1 overflow-y-auto px-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 [&::-webkit-scrollbar-track]:bg-transparent",
            !chatStarted && "flex flex-col items-center pt-[25vh]",
            chatStarted && "pt-8"
          )}
        >
          <div className="pt-8 pb-4 max-w-3xl mx-auto flex flex-col gap-0 w-full min-h-full">
            {!chatStarted && (
              <div className="flex flex-col items-center gap-4 mb-8">
                <Avatar className="h-12 w-12">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xl">B</AvatarFallback>
                </Avatar>
                <h1 className="text-3xl font-bold tracking-tight text-center">
                  How can I help you today?
                </h1>
              </div>
            )}

            {messages
              .filter((m) => !m.id?.startsWith(DO_NOT_RENDER_ID_PREFIX))
              .map((message, index) => {
                if (message.type === 'tool') return null;

                return message.type === 'human' ? (
                  <HumanMessage
                    key={message.id || `human-${index}`}
                    message={message}
                    isLoading={isLoading}
                  />
                ) : (
                  <AssistantMessage
                    key={message.id || `ai-${index}`}
                    message={message}
                    nextMessages={messages.slice(index + 1)}
                    isLoading={isLoading}
                    onRegenerate={handleRegenerate}
                  />
                );
              })}
            
            {isLoading && !firstTokenReceived && <AssistantMessageLoading />}
          </div>
        </div>

        <div className={cn(
          "bg-background/95 backdrop-blur-sm p-4 shrink-0",
          !chatStarted && "flex flex-col items-center"
        )}>
          <div className="max-w-3xl w-full mx-auto relative px-4 sm:px-0">
            <div className="bg-muted/50 hover:bg-muted/80 transition-colors rounded-3xl border shadow-sm p-2">
              <form onSubmit={handleSubmit} className="flex flex-col gap-2">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === 'Enter' && 
                      !e.shiftKey && 
                      !e.metaKey &&
                      !e.nativeEvent.isComposing
                    ) {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder="Type your message..."
                  className="min-h-[44px] max-h-[400px] resize-none border-0 bg-transparent shadow-none ring-0 outline-none focus:ring-0 px-3 py-2 text-base"
                  style={{ fieldSizing: 'content' } as any}
                />
                <div className="flex items-center justify-between px-2 pb-1">
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" type="button" className="h-9 w-9 text-muted-foreground hover:text-foreground rounded-full">
                      <Plus className="h-5 w-5" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    {isLoading ? (
                      <Button 
                        key="stop" 
                        onClick={stop} 
                        type="button" 
                        size="icon"
                        variant="secondary"
                        className="h-9 w-9 rounded-full shadow-sm"
                      >
                        <StopCircle className="h-5 w-5" />
                      </Button>
                    ) : (
                      <Button 
                        type="submit" 
                        disabled={!input.trim()} 
                        size="icon"
                        className="h-9 w-9 rounded-full shadow-md transition-all active:scale-95 disabled:opacity-50 disabled:scale-100"
                      >
                        <Send className="h-5 w-5" />
                      </Button>
                    )}
                  </div>
                </div>
              </form>
            </div>
            <p className="text-[10px] text-center text-muted-foreground mt-3 px-4">
              Bernard can make mistakes. Consider checking important information.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
