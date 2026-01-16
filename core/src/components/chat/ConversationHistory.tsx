import { useEffect, useState, memo, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { TypedText } from './TypedText';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { useThreads } from '@/providers/ThreadProvider';
import type { ThreadListItem } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import { Client } from '@langchain/langgraph-sdk';
import { getAPIClient } from '@/lib/api/client';
import {
  PanelRight,
  PanelRightOpen,
  Plus,
  Shield,
  X,
  MoreVertical,
  Trash2,
  Pencil,
  Check,
  Wand2,
} from 'lucide-react';
import { UserBadge } from '../UserBadge';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { AlertDialog } from '../ui/dialog';
import { Input } from '../ui/input';
import { toast } from 'sonner';

export const SIDEBAR_STORAGE_KEY = 'bernard-chat-sidebar-open';

export function useSidebarState() {
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

  return [isOpen, setIsOpen] as const;
}

function ThreadItemInner({
  thread,
  isActive,
  onClick,
}: {
  thread: ThreadListItem;
  isActive: boolean;
  onClick: (id: string) => void;
}) {
  const { updateThread, deleteThread, getThreads } = useThreads();
  const searchParams = useSearchParams();
  const router = useRouter();
  const threadId = searchParams.get('threadId');
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(thread.name || '');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeletingLoading, setIsDeletingLoading] = useState(false);
  const [isAutoRenaming, setIsAutoRenaming] = useState(false);

  useEffect(() => {
    setNewName(thread.name || '');
  }, [thread.name]);

  const handleRename = async () => {
    if (newName.trim() && newName !== thread.name) {
      try {
        await updateThread(thread.id, newName.trim());
      } catch (error) {
        console.error('Rename failed:', error);
      }
    }
    setIsRenaming(false);
  };

  const handleDelete = async () => {
    setIsDeletingLoading(true);
    try {
      await deleteThread(thread.id);
      if (threadId === thread.id) {
        router.replace('/bernard/chat');
      }
    } catch (error) {
      console.error('Delete failed:', error);
    } finally {
      setIsDeletingLoading(false);
      setIsDeleting(false);
    }
  };

  const handleAutoRename = async () => {
    if (!thread.id) return;

    setIsAutoRenaming(true);
    try {
      // Use /threads path - proxies to LangGraph server (bernard-agent:2024)
      const client = new Client({
        apiUrl: window.location.origin
      });
      const state = await client.threads.getState(thread.id) as { values?: { messages?: Array<{ type: string; content: unknown }> } };
      const messages = state?.values?.messages || [];

      const apiClient = getAPIClient();
      await apiClient.autoRenameThread(thread.id, undefined, messages);
      await getThreads();
      toast.success('Thread renamed successfully');
    } catch (error) {
      console.error('Auto-rename failed:', error);
      toast.error('Failed to rename thread');
    } finally {
      setIsAutoRenaming(false);
    }
  };

  return (
    <div data-testid={`thread-item-${thread.id}`} className="w-full px-1 group relative">
      {isRenaming ? (
        <div className="flex items-center gap-1 w-full px-2 py-1 rounded-md bg-muted">
          <Input
            data-testid="thread-rename-input"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename();
              if (e.key === 'Escape') setIsRenaming(false);
            }}
            className="h-7 text-sm py-0 px-2 bg-background border-border focus:ring-1 focus:ring-primary"
            autoFocus
          />
          <Button
            data-testid="thread-rename-submit"
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0 text-primary hover:text-primary hover:bg-primary/10"
            onClick={(e) => {
              e.stopPropagation();
              handleRename();
            }}
          >
            <Check className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <>
          <Button
            data-testid={`thread-item-button-${thread.id}`}
            variant="ghost"
            className={cn(
              'text-left items-start justify-start font-normal w-full pr-10',
              'hover:bg-muted',
              isActive && 'bg-muted'
            )}
            onClick={(e) => {
              e.preventDefault();
              onClick(thread.id);
            }}
          >
            <TypedText
              text={thread.name || `Thread ${thread.id.slice(0, 8)}`}
              speed={10}
              className="truncate text-sm"
            />
          </Button>

          <div data-testid={`thread-item-menu-${thread.id}`} className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  data-testid={`thread-item-menu-trigger-${thread.id}`}
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:bg-background/80"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  data-testid={`thread-rename-button-${thread.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsRenaming(true);
                  }}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  data-testid={`thread-auto-rename-button-${thread.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAutoRename();
                  }}
                  disabled={isAutoRenaming}
                >
                  <Wand2 className="mr-2 h-4 w-4" />
                  Auto-Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  data-testid={`thread-delete-button-${thread.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsDeleting(true);
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </>
      )}

      <AlertDialog
        open={isDeleting}
        onOpenChange={setIsDeleting}
        title="Delete Thread"
        description="Are you sure you want to delete this thread? This action cannot be undone."
        confirmText="Delete"
        onConfirm={handleDelete}
        variant="warning"
        confirmVariant="destructive"
        loading={isDeletingLoading}
      />
    </div>
  );
}

// Custom comparator for ThreadItem - only re-render if id, name, or isActive changes
const areThreadItemEqual = (prev: { thread: ThreadListItem; isActive: boolean }, next: { thread: ThreadListItem; isActive: boolean }) => {
  return prev.thread.id === next.thread.id &&
    prev.thread.name === next.thread.name &&
    prev.isActive === next.isActive;
};

const ThreadItem = memo(ThreadItemInner, areThreadItemEqual);

function ThreadList({
  threads,
  activeId,
  onThreadClick,
}: {
  threads: ThreadListItem[];
  activeId: string | null;
  onThreadClick: (id: string) => void;
}) {
  return (
    <div data-testid="thread-list-component" className="flex flex-col w-full gap-1 items-start justify-start">
      {threads.map((t) => (
        <ThreadItem
          key={t.id}
          thread={t}
          isActive={activeId === t.id}
          onClick={onThreadClick}
        />
      ))}
      {threads.length === 0 && (
        <p data-testid="no-threads-message" className="text-muted-foreground text-sm p-4 text-center w-full">No chats yet</p>
      )}
    </div>
  );
}

// Custom comparator to prevent re-renders when thread objects are replaced but content is same
const areThreadsEqual = (prev: { threads: ThreadListItem[]; activeId: string | null }, next: { threads: ThreadListItem[]; activeId: string | null }) => {
  if (prev.activeId !== next.activeId) return false;
  if (prev.threads.length !== next.threads.length) return false;
  return prev.threads.every((t, i) => {
    const nextT = next.threads[i];
    return t.id === nextT.id && t.name === nextT.name;
  });
};

const MemoizedThreadList = memo(ThreadList, areThreadsEqual);

function ThreadHistoryLoading() {
  return (
    <div data-testid="thread-history-loading" className="flex flex-col w-full gap-2 px-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="w-full h-10 rounded-md" />
      ))}
    </div>
  );
}

export function ConversationHistory() {
  const [isOpen, setIsOpen] = useSidebarState();
  const searchParams = useSearchParams();
  const router = useRouter();
  const threadId = searchParams.get('threadId');
  const { threads, threadsLoading, getThreads, createNewThread } = useThreads();
  const { state } = useAuth();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (threads.length === 0) {
      getThreads();
    }
  }, [getThreads, threads.length]);

  const handleThreadClick = useCallback((id: string) => {
    router.replace(`/bernard/chat?threadId=${id}`);
  }, [router]);

  const handleNewChat = async () => {
    setIsCreating(true);
    try {
      const newId = await createNewThread();
      handleThreadClick(newId);
    } finally {
      setIsCreating(false);
    }
  };

  const toggleSidebar = () => setIsOpen((prev: boolean) => !prev);

  return (
    <>
      <motion.div
        data-testid="conversation-history-sidebar"
        className={cn(
          'hidden lg:flex flex-col h-screen shrink-0 border-r bg-background relative',
          isOpen ? 'w-[300px]' : 'w-0 overflow-hidden'
        )}
        initial={false}
        animate={{
          width: isOpen ? 300 : 0,
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        <div data-testid="sidebar-header" className="flex items-center justify-between w-full p-4 h-16 border-b shrink-0">
          <div className="flex items-center gap-2">
            <Button data-testid="sidebar-toggle-button" variant="ghost" size="icon" onClick={toggleSidebar}>
              <PanelRightOpen className="size-5" />
            </Button>
            <h1 data-testid="sidebar-title" className="font-bold text-lg tracking-tight">History</h1>
          </div>
          <Button data-testid="new-chat-button" variant="ghost" size="icon" onClick={handleNewChat} disabled={isCreating}>
            <Plus className={cn("size-5", isCreating && "animate-spin")} />
          </Button>
        </div>

        <div data-testid="thread-list-container" className="flex-1 overflow-y-auto overflow-x-hidden p-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 [&::-webkit-scrollbar-track]:bg-transparent">
          {threadsLoading ? (
            <div data-testid="thread-list-loading">
              <ThreadHistoryLoading />
            </div>
          ) : (
            <div data-testid="thread-list">
              <MemoizedThreadList
                threads={threads}
                activeId={threadId || null}
                onThreadClick={handleThreadClick}
              />
            </div>
          )}
        </div>

        <div data-testid="sidebar-footer" className="p-4 border-t space-y-4 shrink-0 bg-background/50 backdrop-blur-sm">
          {state.user?.isAdmin && (
            <Link
              data-testid="admin-dashboard-link"
              href="/admin"
              className="flex items-center px-3 py-2 text-sm font-medium rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-all group"
            >
              <Shield className="mr-3 h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
              Admin Dashboard
            </Link>
          )}
          <div data-testid="user-badge">
            <UserBadge />
          </div>
        </div>
      </motion.div>

      <motion.div
        data-testid="mobile-sidebar"
        className={cn(
          'lg:hidden fixed inset-y-0 left-0 z-50 flex flex-col w-[280px] bg-background border-r shadow-2xl shadow-black/20',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        initial={false}
        animate={{
          translateX: isMobileOpen ? 0 : '-100%',
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        <div data-testid="mobile-sidebar-header" className="flex items-center justify-between p-4 border-b">
          <h1 className="font-bold text-lg tracking-tight">History</h1>
          <Button variant="ghost" size="icon" onClick={() => setIsMobileOpen(false)}>
            <X className="size-5" />
          </Button>
        </div>

        <div data-testid="mobile-thread-list" className="flex-1 overflow-y-auto p-2">
          <Button
            data-testid="mobile-new-chat-button"
            variant="outline"
            className="w-full mb-4 justify-start gap-2"
            onClick={() => {
              handleNewChat();
              setIsMobileOpen(false);
            }}
            disabled={isCreating}
          >
            <Plus className={cn("size-4", isCreating && "animate-spin")} />
            New Chat
          </Button>

          {threadsLoading ? (
            <div data-testid="mobile-thread-list-loading">
              <ThreadHistoryLoading />
            </div>
          ) : (
            <div data-testid="mobile-thread-list-content">
              <MemoizedThreadList
                threads={threads}
                activeId={threadId || null}
                onThreadClick={(id) => {
                  handleThreadClick(id);
                  setIsMobileOpen(false);
                }}
              />
            </div>
          )}
        </div>

        <div data-testid="mobile-sidebar-footer" className="p-4 border-t">
          <div data-testid="mobile-user-badge">
            <UserBadge />
          </div>
        </div>
      </motion.div>

      <div className="lg:hidden fixed left-4 top-4 z-20">
        <Button
          data-testid="mobile-sidebar-toggle"
          variant="secondary"
          size="icon"
          className="rounded-full shadow-lg h-10 w-10 border bg-background/80 backdrop-blur-sm hover:scale-105 transition-transform"
          onClick={() => setIsMobileOpen(true)}
        >
          <PanelRight className="size-5" />
        </Button>
      </div>

      {isMobileOpen && (

        <motion.div
          data-testid="mobile-sidebar-overlay"
          className="lg:hidden fixed inset-0 bg-black/20 backdrop-blur-[2px] z-40"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setIsMobileOpen(false)}
        />
      )}
    </>
  );
}
