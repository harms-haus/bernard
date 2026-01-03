import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { useThreads } from '../../providers/ThreadProvider';
import { useAuth } from '../../hooks/useAuth';
import { PanelRight, PanelRightOpen, Plus, Shield, X } from 'lucide-react';
import { UserBadge } from '../UserBadge';
import { cn } from '../../lib/utils';

const SIDEBAR_STORAGE_KEY = 'bernard-chat-sidebar-open';

function useSidebarState() {
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY);
      return saved !== null ? JSON.parse(saved) : true;
    }
    return true;
  });

  useEffect(() => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(isOpen));
  }, [isOpen]);

  // Listen for toggle events from Thread
  useEffect(() => {
    const handleToggle = () => setIsOpen((prev: boolean) => !prev);
    window.addEventListener('toggle-sidebar', handleToggle);
    return () => window.removeEventListener('toggle-sidebar', handleToggle);
  }, []);

  return [isOpen, setIsOpen] as const;
}

export function ConversationHistory() {
  const [isOpen, setIsOpen] = useSidebarState();
  const [searchParams, setSearchParams] = useSearchParams();
  const threadId = searchParams.get('threadId');
  const { threads, threadsLoading, getThreads } = useThreads();
  const { state } = useAuth();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    getThreads();
  }, [getThreads]);

  const handleThreadClick = (id: string) => {
    setSearchParams({ threadId: id });
  };

  const toggleSidebar = () => setIsOpen((prev: boolean) => !prev);

  return (
    <>
      {/* Desktop Sidebar - consumes space in flex layout */}
      <motion.div
        className={cn(
          "hidden lg:flex flex-col border-r bg-background items-start justify-start gap-4 h-screen shrink-0",
          isOpen ? "w-[300px]" : "w-0 overflow-hidden"
        )}
        animate={{
          width: isOpen ? 300 : 0,
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        <div className="flex items-center justify-between w-full pt-1.5 px-4">
          <Button variant="ghost" onClick={toggleSidebar}>
            <PanelRight className="size-5" />
          </Button>
          <h1 className="text-xl font-semibold tracking-tight">Chat History</h1>
        </div>
        
        <div className="flex-1 overflow-y-auto w-full px-2">
          {threadsLoading ? (
            <ThreadHistoryLoading />
          ) : (
            <ThreadList 
              threads={threads} 
              activeId={threadId || null}
              onThreadClick={handleThreadClick}
            />
          )}
        </div>

        {/* Footer with Admin button and User profile */}
        <div className="w-full border-t border-border p-4 space-y-3">
          {state.user?.isAdmin && (
            <Link
              to="/admin"
              className="flex items-center px-2 py-2 text-sm font-medium rounded-md text-foreground hover:bg-accent hover:text-accent-foreground transition-colors duration-200"
            >
              <Shield className="mr-3 h-5 w-5" />
              Admin
            </Link>
          )}

          <UserBadge />
        </div>
      </motion.div>

      {/* Mobile Sidebar - slide-out panel, no modal/dimming */}
      <motion.div
        className={cn(
          "lg:hidden fixed inset-y-0 left-0 z-50 flex flex-col border-r bg-background items-start justify-start gap-4 w-[300px] shrink-0",
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
        initial={false}
        animate={{
          translateX: isMobileOpen ? 0 : '-100%',
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        <div className="flex items-center justify-between w-full pt-1.5 px-4">
          <Button variant="ghost" onClick={() => setIsMobileOpen(false)}>
            <X className="size-5" />
          </Button>
          <h1 className="text-xl font-semibold tracking-tight">Chat History</h1>
        </div>
        
        <div className="flex-1 overflow-y-auto w-full px-2">
          {threadsLoading ? (
            <ThreadHistoryLoading />
          ) : (
            <ThreadList 
              threads={threads} 
              activeId={threadId || null}
              onThreadClick={(id) => {
                handleThreadClick(id);
                setIsMobileOpen(false);
              }}
            />
          )}
        </div>

        {/* Footer with Admin button and User profile */}
        <div className="w-full border-t border-border p-4 space-y-3">
          {state.user?.isAdmin && (
            <Link
              to="/admin"
              className="flex items-center px-2 py-2 text-sm font-medium rounded-md text-foreground hover:bg-accent hover:text-accent-foreground transition-colors duration-200"
              onClick={() => setIsMobileOpen(false)}
            >
              <Shield className="mr-3 h-5 w-5" />
              Admin
            </Link>
          )}

          <UserBadge />
        </div>
      </motion.div>

      {/* Mobile toggle button */}
      <motion.div
        className="lg:hidden fixed left-4 top-4 z-30"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
      >
        <Button variant="ghost" size="icon" onClick={() => setIsMobileOpen(true)} aria-label="Open chat history">
          <PanelRightOpen className="size-5" />
        </Button>
      </motion.div>

      {/* Mobile overlay - just for visual indication, no dimming */}
      {isMobileOpen && (
        <motion.div
          className="lg:hidden fixed inset-0 bg-black/5 z-30"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setIsMobileOpen(false)}
        />
      )}
    </>
  );
}

function ThreadList({ 
  threads, 
  activeId,
  onThreadClick 
}: { 
  threads: any[]; 
  activeId: string | null;
  onThreadClick: (id: string) => void;
}) {
  return (
    <div className="h-full flex flex-col w-full gap-2 items-start justify-start overflow-y-auto px-2 py-2">
      <Button
        variant="ghost"
        className="w-full justify-start"
        onClick={() => {
          const newId = `thread_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
          onThreadClick(newId);
        }}
      >
        <Plus className="mr-2 h-4 w-4" />
        New Chat
      </Button>
      {threads.map((t) => (
        <Button
          key={t.id}
          variant={activeId === t.id ? 'secondary' : 'ghost'}
          className="text-left items-start justify-start font-normal w-full truncate"
          onClick={() => onThreadClick(t.id)}
        >
          <span className="truncate">{t.name || `Thread ${t.id.slice(0, 8)}`}</span>
        </Button>
      ))}
      {threads.length === 0 && (
        <p className="text-muted-foreground text-sm p-4">No threads yet</p>
      )}
    </div>
  );
}

function ThreadHistoryLoading() {
  return (
    <div className="h-full flex flex-col w-full gap-2 items-start justify-start overflow-y-auto px-2 py-2">
      {Array.from({ length: 10 }).map((_, i) => (
        <Skeleton key={i} className="w-full h-10" />
      ))}
    </div>
  );
}
