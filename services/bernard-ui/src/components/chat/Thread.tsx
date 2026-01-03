import { useState, useEffect, FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { useStream } from '../../providers/StreamProvider';
import { useThreads } from '../../providers/ThreadProvider';
import { useDarkMode } from '../../hooks/useDarkMode';
import { ConversationHistory } from './ConversationHistory';
import { HumanMessage } from './messages/human';
import { AssistantMessage, AssistantMessageLoading } from './messages/ai';
import { cn } from '../../lib/utils';
import { ArrowDown, PanelRightOpen, PenSquare, MoreVertical, Ghost, Plus, Copy, Download, Sun, Moon } from 'lucide-react';
import { toast } from 'sonner';
import type { Message } from '@langchain/langgraph-sdk';

// Hook to check if sidebar is open
function useSidebarOpen() {
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('bernard-chat-sidebar-open');
    setIsOpen(saved === null ? true : JSON.parse(saved));
  }, []);

  return isOpen;
}

function ScrollToBottomButton({ className }: { className?: string }) {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  if (isAtBottom) return null;
  
  return (
    <Button variant="outline" className={cn("absolute bottom-full left-1/2 -translate-x-1/2 mb-4", className)} onClick={() => scrollToBottom()}>
      <ArrowDown className="w-4 h-4 mr-2" />
      Scroll to bottom
    </Button>
  );
}

export function Thread() {
  const [searchParams, setSearchParams] = useSearchParams();
  const threadId = searchParams.get('threadId');
  
  const { messages, submit, isLoading, stop } = useStream();
  const { getThreads } = useThreads();
  const { isDarkMode, toggleDarkMode } = useDarkMode();
  const sidebarOpen = useSidebarOpen();
  
  const [input, setInput] = useState('');
  const [isGhostMode, setIsGhostMode] = useState(false);

  // Refresh thread list on mount
  useEffect(() => {
    getThreads();
  }, [getThreads]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const newHumanMessage: Message = {
      id: `human_${Date.now()}`,
      type: 'human',
      content: input.trim(),
    };

    await submit({ messages: [...messages, newHumanMessage] }, { threadId: threadId || undefined });
    setInput('');
  };

  const handleNewChat = () => {
    const newId = `thread_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    setSearchParams({ threadId: newId });
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

  const toggleSidebar = () => {
    window.dispatchEvent(new CustomEvent('toggle-sidebar'));
  };

  const chatStarted = !!threadId || !!messages.length;

  return (
    <div className="flex w-full h-screen overflow-hidden">
      <ConversationHistory />
      
      <div
        className={cn(
          "flex-1 flex flex-col min-w-0 overflow-hidden relative",
          !chatStarted && "grid-rows-[1fr]"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 p-2 z-10 relative border-b bg-background">
          <div className="flex items-center gap-2">
            {/* Toggle sidebar button - shows when sidebar is closed */}
            {!sidebarOpen && (
              <Button variant="ghost" onClick={toggleSidebar} aria-label="Open chat history">
                <PanelRightOpen className="size-5" />
              </Button>
            )}
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback>B</AvatarFallback>
              </Avatar>
              <span className="font-medium">Bernard</span>
              {isGhostMode && <Ghost className="h-4 w-4 text-muted-foreground" />}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Light/Dark mode toggle */}
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

        {/* Messages Area */}
        <StickToBottom 
          className="relative flex-1 overflow-y-auto"
          resize="smooth"
          initial="smooth"
        >
          <StickToBottom.Content className="px-4">
            <div className="pt-8 pb-16 max-w-3xl mx-auto flex flex-col gap-4 w-full">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-[50vh]">
                  <Avatar className="h-16 w-16 mb-4">
                    <AvatarFallback className="text-2xl">B</AvatarFallback>
                  </Avatar>
                  <h2 className="text-xl font-semibold mb-2">How can I help you today?</h2>
                  <p className="text-muted-foreground">Ask about the weather, set a timer, or search the web.</p>
                </div>
              )}
              
              {messages.map((message, index) => (
                message.type === 'human' ? (
                  <HumanMessage key={message.id || `human-${index}`} message={message} />
                ) : (
                  <AssistantMessage key={message.id || `ai-${index}`} message={message} />
                )
              ))}
              
              {isLoading && <AssistantMessageLoading />}
            </div>
          </StickToBottom.Content>
          
          <div className="sticky flex flex-col items-center gap-8 bottom-0 bg-background/80 backdrop-blur-sm z-20">
            <ScrollToBottomButton />
            
            {/* Input Area */}
            <div className="bg-muted rounded-2xl border shadow-sm mx-auto mb-4 w-full max-w-3xl relative z-10">
              <form onSubmit={handleSubmit} className="grid grid-rows-[1fr_auto] gap-2 max-w-3xl mx-auto p-2">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey) {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder="Type your message..."
                  className="min-h-[44px] max-h-[200px] resize-none border-0 bg-transparent shadow-none ring-0 outline-none focus:ring-0"
                />
                <div className="flex items-center justify-between">
                  <Button variant="ghost" size="icon" type="button">
                    <Plus className="h-4 w-4" />
                  </Button>
                  {isLoading ? (
                    <Button key="stop" onClick={stop} type="button">
                      <div className="w-4 h-4 mr-2 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Cancel
                    </Button>
                  ) : (
                    <Button type="submit" disabled={!input.trim()}>
                      Send
                    </Button>
                  )}
                </div>
              </form>
            </div>
          </div>
        </StickToBottom>
      </div>
    </div>
  );
}
