import { useState } from 'react';
import { Eye, MoreVertical, Archive, Trash2, Link, Loader2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ConversationListItem } from '@/types/conversation';

interface ConversationListTableProps {
  conversations: ConversationListItem[];
  showUserColumn?: boolean;
  onView?: (conversationId: string) => void;
  onArchive?: (conversationId: string) => void;
  onDelete?: (conversationId: string) => void;
  onCopyLink?: (conversationId: string) => void;
  onContinue?: (conversationId: string) => void;
  loading?: boolean;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function truncateId(id: string, length: number = 12): string {
  if (id.length <= length) return id;
  return `${id.substring(0, length)}...`;
}

export function ConversationListTable({
  conversations,
  showUserColumn = false,
  onView,
  onArchive,
  onDelete,
  onCopyLink,
  onContinue,
  loading = false,
}: ConversationListTableProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const handleArchive = async (conversationId: string) => {
    setActionLoading(conversationId);
    try {
      await onArchive?.(conversationId);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (conversationId: string) => {
    setActionLoading(conversationId);
    try {
      await onDelete?.(conversationId);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCopyLink = async (conversationId: string) => {
    setActionLoading(conversationId);
    try {
      await onCopyLink?.(conversationId);
    } finally {
      setActionLoading(null);
    }
  };

  const handleContinue = async (conversationId: string) => {
    setActionLoading(conversationId);
    try {
      await onContinue?.(conversationId);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12" />
            <TableHead>Name</TableHead>
            <TableHead className="w-48">Created</TableHead>
            <TableHead className="w-28">Stats</TableHead>
            {showUserColumn && <TableHead className="w-40">User</TableHead>}
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {conversations.map((conversation) => (
            <TableRow key={conversation.id}>
              <TableCell className="py-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onView?.(conversation.id)}
                  className="h-8 w-8 p-0"
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </TableCell>
              <TableCell className="py-3">
                <div className="flex flex-col">
                  <span className="font-medium">
                    {conversation.name || truncateId(conversation.id)}
                  </span>
                  {!conversation.name && (
                    <span className="text-xs text-muted-foreground font-mono">
                      {conversation.id}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="py-3">
                <div className="flex flex-col">
                  <span className="text-sm">{formatDate(conversation.createdAt)}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatTime(conversation.createdAt)}
                  </span>
                </div>
              </TableCell>
              <TableCell className="py-3">
                <span className="text-sm font-mono">
                  {conversation.messageCount}/{conversation.llmCallCount ?? '-'}/{conversation.toolCallCount}
                </span>
              </TableCell>
              {showUserColumn && (
                <TableCell className="py-3">
                  <div className="flex flex-col">
                    <span className="text-sm">{conversation.userName || 'Unknown'}</span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {truncateId(conversation.userId, 8)}
                    </span>
                  </div>
                </TableCell>
              )}
              <TableCell className="py-3 text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onView?.(conversation.id)}>
                      <Eye className="mr-2 h-4 w-4" />
                      View
                    </DropdownMenuItem>
                    {onContinue && (
                      <DropdownMenuItem onClick={() => handleContinue(conversation.id)} disabled={actionLoading === conversation.id}>
                        <Play className="mr-2 h-4 w-4" />
                        Continue
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => handleCopyLink(conversation.id)} disabled={actionLoading === conversation.id}>
                      <Link className="mr-2 h-4 w-4" />
                      Copy Link
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleArchive(conversation.id)} disabled={actionLoading === conversation.id || conversation.archived}>
                      <Archive className="mr-2 h-4 w-4" />
                      Archive
                    </DropdownMenuItem>
                    {onDelete && (
                      <DropdownMenuItem
                        onClick={() => handleDelete(conversation.id)}
                        disabled={actionLoading === conversation.id}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}

          {conversations.length === 0 && (
            <TableRow>
              <TableCell colSpan={showUserColumn ? 6 : 5} className="py-8 text-center text-muted-foreground">
                No conversations found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
