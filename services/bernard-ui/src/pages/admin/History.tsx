import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { ConversationListTable } from '../../components/conversation/ConversationListTable';
import { adminApiClient } from '../../services/adminApi';
import { useConfirmDialog } from '../../components/DialogManager';
import { useToast } from '../../components/ToastManager';
import type { ConversationListItem } from '../../types/conversation';

export default function History() {
  const [loading, setLoading] = useState(false);
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [clearingIndex, setClearingIndex] = useState(false);

  // Hook calls - must be at the top level of the component function
  const confirmDialog = useConfirmDialog();
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    loadConversations(0);
  }, [includeArchived]);

  const loadConversations = async (offsetParam: number = offset) => {
    setLoading(true);
    try {
      const response = await adminApiClient.listAllConversations({
        archived: includeArchived,
        limit: 50,
        offset: offsetParam,
      });
      if (offsetParam === 0) {
        setConversations(response.conversations);
      } else {
        setConversations(prev => [...prev, ...response.conversations]);
      }
      setHasMore(response.hasMore);
      setOffset(offsetParam + response.conversations.length);
    } catch (error) {
      console.error('Failed to load conversations:', error);
      toast.error('Failed to load conversations');
    } finally {
      setLoading(false);
    }
  };

  const loadMore = () => {
    loadConversations(offset);
  };

  const handleViewConversation = (conversationId: string) => {
    navigate(`/admin/history/${conversationId}`);
  };

  const handleArchiveConversation = async (conversationId: string) => {
    try {
      await adminApiClient.archiveConversation(conversationId);
      setConversations(conversations.filter(c => c.id !== conversationId));
      toast.success('Conversation archived');
    } catch (error) {
      console.error('Failed to archive conversation:', error);
      toast.error('Failed to archive conversation');
    }
  };

  const handleDeleteConversation = async (conversationId: string) => {
    confirmDialog({
      title: 'Delete this conversation?',
      description: 'This action cannot be undone.',
      confirmVariant: 'destructive',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      onConfirm: async () => {
        try {
          await adminApiClient.deleteConversation(conversationId);
          setConversations(conversations.filter(c => c.id !== conversationId));
          toast.success('Conversation deleted successfully');
        } catch (error) {
          console.error('Failed to delete conversation:', error);
          toast.error('Failed to delete conversation');
        }
      }
    });
  };

  const handleCopyLink = async (conversationId: string) => {
    const link = `${window.location.origin}/bernard/conversations/${conversationId}`;
    await navigator.clipboard.writeText(link);
    toast.success('Link copied to clipboard');
  };

  const handleClearEntireIndex = async () => {
    confirmDialog({
      title: '⚠️ DANGER: Clear Entire Conversation Index?',
      description: 'This will permanently delete all conversation chunks from the vector store (including orphaned chunks from deleted conversations), drop the entire Redis search index, and remove all semantic search capabilities. All existing conversations will remain intact and be immediately queued for re-indexing. This action cannot be undone. Are you absolutely sure?',
      confirmText: 'Yes, Delete Everything',
      confirmVariant: 'destructive',
      cancelText: 'Cancel',
      onConfirm: async () => {
        setClearingIndex(true);
        try {
          const result = await adminApiClient.clearEntireIndex();
          if (result.success) {
            toast.success(
              `Index cleared successfully. Deleted ${result.keysDeleted} keys and queued ${result.conversationsQueued} conversations for re-indexing.`
            );
            await loadConversations(0);
          } else {
            toast.error('Failed to clear index');
          }
        } catch (error) {
          console.error('Failed to clear entire index:', error);
          toast.error('Failed to clear entire index');
        } finally {
          setClearingIndex(false);
        }
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Conversation History</h1>
          <p className="text-gray-600 dark:text-gray-300">Review and manage historical conversations</p>
        </div>
        <div className="flex items-center space-x-3">
          <Button
            onClick={handleClearEntireIndex}
            variant="destructive"
            disabled={clearingIndex}
            className="flex items-center"
          >
            <AlertTriangle className="mr-2 h-4 w-4" />
            {clearingIndex ? 'Clearing Index...' : 'Clear Index'}
          </Button>
          <Button onClick={() => loadConversations(0)} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Conversations Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Conversations</CardTitle>
          <CardDescription>
            View and manage conversation history
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(e) => setIncludeArchived(e.target.checked)}
                className="rounded border-gray-300 text-primary focus:ring-primary"
              />
              <span>Include archived</span>
            </label>
          </div>
          <ConversationListTable
            conversations={conversations}
            showUserColumn={true}
            onView={handleViewConversation}
            onArchive={handleArchiveConversation}
            onDelete={handleDeleteConversation}
            onCopyLink={handleCopyLink}
            loading={loading}
          />
          {hasMore && (
            <Button variant="outline" className="w-full mt-4" onClick={loadMore}>
              Load More
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
