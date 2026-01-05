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
        <div className="flex items-center gap-1 w-full px-2 py-1 rounded-md bg-gray-100 dark:bg-slate-800">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename();
              if (e.key === 'Escape') setIsRenaming(false);
            }}
            className="h-7 text-sm py-0 px-2 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 focus:ring-1 focus:ring-primary"
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
            title="Save name"
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
              'hover:bg-gray-100 dark:hover:bg-slate-800',
              isActive && 'bg-gray-100 dark:bg-slate-800'
            )}
            onClick={(e) => {
              e.preventDefault();
              onClick(thread.id);
            }}
          >
            <p className="truncate">{thread.name || `Thread ${thread.id.slice(0, 8)}`}</p>
          </Button>

          <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:bg-gray-200 dark:hover:bg-slate-700"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="h-4 w-4 text-slate-500 dark:text-slate-400" />
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
                  className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
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
  const { createNewThread } = useThreads();
  const [isCreating, setIsCreating] = useState(false);

  return (
    <div
      className={cn(
        'h-full flex flex-col w-full gap-2 items-start justify-start',
        'overflow-y-auto px-2 py-2',
        '[&::-webkit-scrollbar]:w-1.5',
        '[&::-webkit-scrollbar-thumb]:rounded-full',
        '[&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600',
        '[&::-webkit-scrollbar-track]:bg-transparent'
      )}
    >
      <Button
        variant="ghost"
        className="w-full justify-start text-muted-foreground hover:text-foreground hover:bg-gray-100 dark:hover:bg-slate-800"
        disabled={isCreating}
        onClick={async () => {
          setIsCreating(true);
          try {
            const newId = await createNewThread();
            onThreadClick(newId);
          } finally {
            setIsCreating(false);
          }
        }}
      >
        <Plus className={cn("mr-2 h-4 w-4", isCreating && "animate-spin")} />
        {isCreating ? 'Creating...' : 'New Chat'}
      </Button>
      {threads.map((t) => (
        <ThreadItem
          key={t.id}
          thread={t}
          isActive={activeId === t.id}
          onClick={onThreadClick}
        />
      ))}
      {threads.length === 0 && (
        <p className="text-muted-foreground text-sm p-4">No threads yet</p>
      )}
    </div>
  );
}

function ThreadHistoryLoading() {
  return (
    <div
      className={cn(
        'h-full flex flex-col w-full gap-2 items-start justify-start',
        'overflow-y-auto px-2 py-2',
        '[&::-webkit-scrollbar]:w-1.5',
        '[&::-webkit-scrollbar-thumb]:rounded-full',
        '[&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600',
        '[&::-webkit-scrollbar-track]:bg-transparent'
      )}
    >
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="w-full px-1">
          <Skeleton className="w-[280px] h-10" />
        </div>
      ))}
    </div>
  );
}

export function ConversationHistory() {
  const [isOpen, setIsOpen] = useSidebarState();
  const [searchParams, setSearchParams] = useSearchParams();
  const threadId = searchParams.get('threadId');
  const { threads, threadsLoading, getThreads } = useThreads();
  const { state } = useAuth();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    if (threads.length === 0) {
      getThreads();
    }
  }, [getThreads, threads.length]);

  const handleThreadClick = (id: string) => {
    setSearchParams({ threadId: id });
  };

  const toggleSidebar = () => setIsOpen((prev: boolean) => !prev);

  return (
    <>
      {/* Desktop Sidebar - consumes space in flex layout */}
      <motion.div
        className={cn(
          'hidden lg:flex flex-col',
          'border-r border-slate-200 dark:border-slate-700',
          'bg-white dark:bg-slate-900',
          'items-start justify-start gap-4 h-screen shrink-0',
          isOpen ? 'w-[300px]' : 'w-0 overflow-hidden'
        )}
        animate={{
          width: isOpen ? 300 : 0,
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        <div className="flex items-center justify-between w-full pt-1.5 px-4">
          <Button
            className="hover:bg-gray-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
            variant="ghost"
            onClick={toggleSidebar}
          >
            {isOpen ? (
              <PanelRightOpen className="size-5" />
            ) : (
              <PanelRight className="size-5" />
            )}
          </Button>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Chat History
          </h1>
        </div>

        <div className="flex-1 overflow-y-auto w-full">
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
        <div className="w-full border-t border-slate-200 dark:border-slate-700 p-4 space-y-3">
          {state.user?.isAdmin && (
            <Link
              to="/admin"
              className={cn(
                'flex items-center px-2 py-2 text-sm font-medium rounded-md',
                'text-slate-700 dark:text-slate-300',
                'hover:bg-gray-100 dark:hover:bg-slate-800',
                'hover:text-slate-900 dark:hover:text-slate-100',
                'transition-colors duration-200'
              )}
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
          'lg:hidden fixed inset-y-0 left-0 z-50 flex flex-col',
          'border-r border-slate-200 dark:border-slate-700',
          'bg-white dark:bg-slate-900',
          'items-start justify-start gap-4 w-[300px] shrink-0',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        initial={false}
        animate={{
          translateX: isMobileOpen ? 0 : '-100%',
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        <div className="flex items-center justify-between w-full pt-1.5 px-4">
          <Button
            className="text-slate-600 dark:text-slate-400"
            variant="ghost"
            onClick={() => setIsMobileOpen(false)}
          >
            <X className="size-5" />
          </Button>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Chat History
          </h1>
        </div>

        <div className="flex-1 overflow-y-auto w-full">
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
        <div className="w-full border-t border-slate-200 dark:border-slate-700 p-4 space-y-3">
          {state.user?.isAdmin && (
            <Link
              to="/admin"
              className={cn(
                'flex items-center px-2 py-2 text-sm font-medium rounded-md',
                'text-slate-700 dark:text-slate-300',
                'hover:bg-gray-100 dark:hover:bg-slate-800',
                'hover:text-slate-900 dark:hover:text-slate-100',
                'transition-colors duration-200'
              )}
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
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsMobileOpen(true)}
          aria-label="Open chat history"
          className="bg-white dark:bg-slate-900 shadow-md"
        >
          <PanelRightOpen className="size-5" />
        </Button>
      </motion.div>

      {/* Mobile overlay - just for visual indication, no dimming */}
      {isMobileOpen && (
        <motion.div
          className="lg:hidden fixed inset-0 bg-black/5 dark:bg-black/20 z-30"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setIsMobileOpen(false)}
        />
      )}
    </>
  );
}
