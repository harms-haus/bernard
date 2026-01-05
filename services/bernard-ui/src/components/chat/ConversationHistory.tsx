import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { useThreads } from '../../providers/ThreadProvider';
import type { ThreadListItem } from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
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
} from 'lucide-react';
import { UserBadge } from '../UserBadge';
import { cn } from '../../lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { AlertDialog } from '../ui/dialog';
import { Input } from '../ui/input';

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

function ThreadItem({
  thread,
  isActive,
  onClick,
}: {
  thread: ThreadListItem;
  isActive: boolean;
  onClick: (id: string) => void;
}) {
  const { updateThread, deleteThread } = useThreads();
  const [searchParams, setSearchParams] = useSearchParams();
  const threadId = searchParams.get('threadId');
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(thread.name || '');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeletingLoading, setIsDeletingLoading] = useState(false);

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
        setSearchParams({});
      }
    } catch (error) {
      console.error('Delete failed:', error);
    } finally {
      setIsDeletingLoading(false);
      setIsDeleting(false);
    }
  };

  return (
    <div className="w-full px-1 group relative">
      {isRenaming ? (
        <div className="flex items-center gap-1 w-full px-2 py-1 rounded-md bg-muted">
          <Input
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
            <p className="truncate text-sm">{thread.name || `Thread ${thread.id.slice(0, 8)}`}</p>
          </Button>

          <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
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
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsRenaming(true);
                  }}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
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
    <div className="flex flex-col w-full gap-1 items-start justify-start">
      {threads.map((t) => (
        <ThreadItem
          key={t.id}
          thread={t}
          isActive={activeId === t.id}
          onClick={onThreadClick}
        />
      ))}
      {threads.length === 0 && (
        <p className="text-muted-foreground text-sm p-4 text-center w-full">No chats yet</p>
      )}
    </div>
  );
}

function ThreadHistoryLoading() {
  return (
    <div className="flex flex-col w-full gap-2 px-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="w-full h-10 rounded-md" />
      ))}
    </div>
  );
}

export function ConversationHistory() {
  const [isOpen, setIsOpen] = useSidebarState();
  const [searchParams, setSearchParams] = useSearchParams();
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

  const handleThreadClick = (id: string) => {
    setSearchParams({ threadId: id });
  };

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
        <div className="flex items-center justify-between w-full p-4 h-16 border-b shrink-0">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggleSidebar}>
              <PanelRightOpen className="size-5" />
            </Button>
            <h1 className="font-bold text-lg tracking-tight">History</h1>
          </div>
          <Button variant="ghost" size="icon" onClick={handleNewChat} disabled={isCreating}>
            <Plus className={cn("size-5", isCreating && "animate-spin")} />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 [&::-webkit-scrollbar-track]:bg-transparent">
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

        <div className="p-4 border-t space-y-4 shrink-0 bg-background/50 backdrop-blur-sm">
          {state.user?.isAdmin && (
            <Link
              to="/admin"
              className="flex items-center px-3 py-2 text-sm font-medium rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-all group"
            >
              <Shield className="mr-3 h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
              Admin Dashboard
            </Link>
          )}
          <UserBadge />
        </div>
      </motion.div>

      <motion.div
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
        <div className="flex items-center justify-between p-4 border-b">
          <h1 className="font-bold text-lg tracking-tight">History</h1>
          <Button variant="ghost" size="icon" onClick={() => setIsMobileOpen(false)}>
            <X className="size-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          <Button
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

        <div className="p-4 border-t">
          <UserBadge />
        </div>
      </motion.div>

      <div className="lg:hidden fixed left-4 top-4 z-20">
        <Button
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
