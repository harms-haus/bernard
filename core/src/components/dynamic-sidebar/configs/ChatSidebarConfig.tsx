'use client';

import React, { useEffect, useState, useCallback, memo } from 'react';
import { useSearchParams, useRouter } from '@/lib/router/compat';
import {
    Plus,
    Shield,
    MoreVertical,
    Trash2,
    Pencil,
    Check,
    Wand2,
    MessagesSquare
} from 'lucide-react';
import { useDynamicSidebar } from '../DynamicSidebarContext';
import { useThreads } from '@/providers/ThreadProvider';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '../../ui/button';
import { Skeleton } from '../../ui/skeleton';
import { Input } from '../../ui/input';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import { AlertDialog } from '../../ui/dialog';
import { toast } from 'sonner';
import { getAPIClient } from '@/lib/api/client';
import { TypedText } from '../../chat/TypedText';
import { cn } from '@/lib/utils';
import { ThreadListItem } from '@/services/api';
import { Link } from '@/lib/router/compat';

// Memoized Thread Item Component
const ThreadMenuItemInner = ({
    thread,
    isActive,
    onThreadClick,
    isOpen
}: {
    thread: ThreadListItem;
    isActive: boolean;
    onThreadClick: (id: string) => void;
    isOpen: boolean;
}) => {
    const { updateThread, deleteThread, getThreads } = useThreads();
    const [searchParams] = useSearchParams();
    const router = useRouter();
    const currentThreadId = searchParams.get('threadId');
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
            if (currentThreadId === thread.id) {
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
            const apiClient = getAPIClient();
            await apiClient.autoRenameThread(thread.id);
            await getThreads();
            toast.success('Thread renamed successfully');
        } catch (error) {
            console.error('Auto-rename failed:', error);
            toast.error('Failed to rename thread');
        } finally {
            setIsAutoRenaming(false);
        }
    };

    if (!isOpen) {
        return (
            <Button
                variant="ghost"
                size="icon"
                className={cn(
                    "h-10 w-10 mx-auto",
                    isActive && "bg-accent text-accent-foreground"
                )}
                onClick={() => onThreadClick(thread.id)}
                title={thread.name || 'Chat'}
            >
                <MessagesSquare className="h-5 w-5" />
            </Button>
        );
    }

    return (
        <div className="w-full group relative px-1">
            {isRenaming ? (
                <div className="flex items-center gap-1 w-full px-2 py-1 rounded-md bg-muted">
                    <Input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => {
                            e.stopPropagation();
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
                            'text-left items-start justify-start font-normal w-full pr-10 truncate',
                            'hover:bg-accent/50 hover:text-accent-foreground',
                            isActive && 'bg-accent text-accent-foreground'
                        )}
                        onClick={(e) => {
                            e.preventDefault();
                            onThreadClick(thread.id);
                        }}
                    >
                        <TypedText
                            text={thread.name || `Thread ${thread.id.slice(0, 8)}`}
                            speed={100}
                            className="truncate text-sm"
                        />
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
                                        handleAutoRename();
                                    }}
                                    disabled={isAutoRenaming}
                                >
                                    <Wand2 className="mr-2 h-4 w-4" />
                                    Auto-Rename
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
};

const areThreadItemEqual = (prev: any, next: any) => {
    return prev.thread.id === next.thread.id &&
        prev.thread.name === next.thread.name &&
        prev.isActive === next.isActive &&
        prev.isOpen === next.isOpen;
};

const ThreadMenuItem = memo(ThreadMenuItemInner, areThreadItemEqual);

export function useChatSidebarConfig() {
    const { setHeader, setMenuItems, setFooterItems, reset, isOpen } = useDynamicSidebar();
    const { threads, threadsLoading, getThreads, createNewThread } = useThreads();
    const { state } = useAuth();
    const [searchParams] = useSearchParams();
    const router = useRouter();
    const threadId = searchParams.get('threadId');
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
        if (threads.length === 0) {
            getThreads();
        }
    }, [getThreads, threads.length]);

    const handleThreadClick = useCallback((id: string) => {
        router.replace(`/bernard/chat?threadId=${id}`);
    }, [router]);

    const handleNewChat = useCallback(async () => {
        setIsCreating(true);
        try {
            const newId = await createNewThread();
            handleThreadClick(newId);
        } finally {
            setIsCreating(false);
        }
    }, [createNewThread, handleThreadClick]);

    useEffect(() => {
        // Header
        setHeader({
            type: 'component',
            content: (
                <div className="flex items-center justify-between w-full">
                    {isOpen && <h1 className="font-bold text-lg tracking-tight">Chats</h1>}
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleNewChat}
                        disabled={isCreating}
                        title="New Chat"
                        className={!isOpen ? "mx-auto" : ""}
                    >
                        <Plus className={cn("size-5", isCreating && "animate-spin")} />
                    </Button>
                </div>
            )
        });

        // Menu Items (Thread List)
        if (threadsLoading && threads.length === 0) {
            setMenuItems([
                {
                    id: 'loading',
                    children: (
                        <div className="flex flex-col w-full gap-2 px-2">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <Skeleton key={i} className="w-full h-10 rounded-md" />
                            ))}
                        </div>
                    )
                }
            ]);
        } else {
            setMenuItems(threads.map(thread => ({
                id: thread.id,
                children: (
                    <ThreadMenuItem
                        thread={thread}
                        isActive={threadId === thread.id}
                        onThreadClick={handleThreadClick}
                        isOpen={isOpen}
                    />
                ),
                isActive: threadId === thread.id,
                // We handle the click inside the component because of the complex UI
                className: "p-0"
            })));
        }

        // Footer
        const footerItems: React.ReactNode[] = [];
        if (state.user?.role === 'admin') {
            footerItems.push(
                <Link
                    key="admin-link"
                    to="/bernard/admin"
                    className="flex items-center px-2 py-2 text-sm font-medium rounded-md text-foreground hover:bg-accent hover:text-accent-foreground transition-colors duration-200"
                >
                    <Shield className={isOpen ? "mr-3 h-5 w-5" : "h-5 w-5"} />
                    {isOpen && "Admin Dashboard"}
                </Link>
            );
        }
        setFooterItems(footerItems);

        return () => reset();
    }, [
        setHeader,
        setMenuItems,
        setFooterItems,
        reset,
        isOpen,
        threads,
        threadsLoading,
        threadId,
        handleNewChat,
        isCreating,
        state.user?.role,
        handleThreadClick
    ]);
}

export function ChatSidebarConfig({ children }: { children: React.ReactNode }) {
    useChatSidebarConfig();
    return <>{children}</>;
}
