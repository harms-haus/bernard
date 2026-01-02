import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConversationListTable } from '@/components/conversation/ConversationListTable';
import { apiClient } from '@/services/api';
import type { ConversationListItem } from '@/types/conversation';
import { useToast } from '@/components/ToastManager';
import { setStoredConversationId } from '@/utils/conversationId';

const CONVERSATIONS_LIMIT = 50;

export function Conversations() {
  const navigate = useNavigate();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    loadConversations();
  }, [includeArchived]);

  const loadConversations = async (loadMore = false) => {
    const currentOffset = loadMore ? offset : 0;

    setLoading(true);
    try {
      const response = await apiClient.listConversations({
        archived: includeArchived,
        limit: CONVERSATIONS_LIMIT,
        offset: currentOffset,
      });

      if (loadMore) {
        setConversations((prev) => [...prev, ...response.conversations]);
      } else {
        setConversations(response.conversations);
      }
      setHasMore(response.hasMore);
      setTotal(response.total);
      setOffset(currentOffset + CONVERSATIONS_LIMIT);
    } catch (error) {
      console.error('Failed to load conversations:', error);
      toast.error(
        'Load Failed',
        error instanceof Error ? error.message : 'Failed to load conversations'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLoadMore = () => {
    loadConversations(true);
  };

  const handleViewConversation = (conversationId: string) => {
    navigate(`/conversations/${conversationId}`);
  };

  const handleArchiveConversation = async (conversationId: string) => {
    try {
      await apiClient.archiveConversation(conversationId);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId ? { ...c, archived: true } : c
        )
      );
      toast.success('Success', 'Conversation archived successfully');
    } catch (error) {
      console.error('Failed to archive conversation:', error);
      toast.error(
        'Archive Failed',
        error instanceof Error ? error.message : 'Failed to archive conversation'
      );
    }
  };

  const handleCopyLink = async (conversationId: string) => {
    try {
      const link = `${window.location.origin}/bernard/conversations/${conversationId}`;
      await navigator.clipboard.writeText(link);
      toast.success('Success', 'Link copied to clipboard');
    } catch (error) {
      console.error('Failed to copy link:', error);
      toast.error(
        'Copy Failed',
        error instanceof Error ? error.message : 'Failed to copy link'
      );
    }
  };

  const handleContinue = (conversationId: string) => {
    setStoredConversationId(conversationId);
    navigate('/chat');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Conversations</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your Conversations</CardTitle>
          <CardDescription>
            View and manage your conversation history
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-4 mb-4">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(e) => setIncludeArchived(e.target.checked)}
                className="rounded border-gray-300 text-primary focus:ring-primary"
              />
              <span>Include archived</span>
            </label>
            {total > 0 && (
              <span className="text-sm text-muted-foreground">
                {total} conversation{total !== 1 ? 's' : ''} total
              </span>
            )}
          </div>

          <ConversationListTable
            conversations={conversations}
            showUserColumn={false}
            onView={handleViewConversation}
            onArchive={handleArchiveConversation}
            onCopyLink={handleCopyLink}
            onContinue={handleContinue}
            loading={loading}
          />

          {hasMore && (
            <Button
              variant="outline"
              className="w-full mt-4"
              onClick={handleLoadMore}
              disabled={loading}
            >
              Load More
            </Button>
          )}

          {conversations.length === 0 && !loading && (
            <div className="py-8 text-center text-muted-foreground">
              No conversations yet. Start typing to begin.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
