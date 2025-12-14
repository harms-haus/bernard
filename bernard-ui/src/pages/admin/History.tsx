import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { 
  Eye, 
  Trash2, 
  Play, 
  StopCircle, 
  RefreshCw,
  Search,
  Calendar,
  User,
  Clock,
  MessageSquare
} from 'lucide-react';
import { adminApiClient } from '../../services/adminApi';
import type { ConversationListItem } from '../../services/adminApi';

export default function History() {
  const [loading, setLoading] = useState(false);
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [stats, setStats] = useState({ total: 0, active: 0, closed: 0 });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [indexingAction, setIndexingAction] = useState<{ conversationId: string; action: 'retry' | 'cancel' } | null>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const response = await adminApiClient.listHistory({ 
        includeOpen: true, 
        includeClosed: true 
      });
      setConversations(response.items || []);
      setStats({
        total: response.total || response.items.length || 0,
        active: response.activeCount || 0,
        closed: response.closedCount || 0
      });
    } catch (error) {
      console.error('Failed to load history:', error);
      alert('Failed to load conversation history');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConversation = async (conversationId: string) => {
    if (!confirm('Delete this conversation? This action cannot be undone.')) {
      return;
    }

    setDeletingId(conversationId);
    try {
      await adminApiClient.deleteConversation(conversationId);
      setConversations(conversations.filter(c => c.id !== conversationId));
      loadHistory(); // Refresh stats
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      alert('Failed to delete conversation');
    } finally {
      setDeletingId(null);
    }
  };

  const handleCloseConversation = async (conversationId: string) => {
    try {
      await adminApiClient.closeConversation(conversationId);
      setConversations(conversations.map(c => 
        c.id === conversationId ? { ...c, status: 'closed' as const } : c
      ));
      loadHistory(); // Refresh stats
    } catch (error) {
      console.error('Failed to close conversation:', error);
      alert('Failed to close conversation');
    }
  };

  const handleRetryIndexing = async (conversationId: string) => {
    if (indexingAction) return; // Prevent multiple actions

    setIndexingAction({ conversationId, action: 'retry' });
    try {
      const result = await adminApiClient.retryIndexing(conversationId);
      if (result.success) {
        setConversations(conversations.map(c => 
          c.id === conversationId 
            ? { ...c, indexingStatus: result.indexingStatus, indexingAttempts: (c.indexingAttempts || 0) + 1, indexingError: undefined }
            : c
        ));
      } else {
        alert(result.message || 'Unable to retry indexing');
      }
    } catch (error) {
      console.error('Failed to retry indexing:', error);
      alert('Failed to retry indexing');
    } finally {
      setIndexingAction(null);
    }
  };

  const handleCancelIndexing = async (conversationId: string) => {
    if (indexingAction) return; // Prevent multiple actions

    setIndexingAction({ conversationId, action: 'cancel' });
    try {
      const result = await adminApiClient.cancelIndexing(conversationId);
      if (result.success) {
        setConversations(conversations.map(c => 
          c.id === conversationId 
            ? { ...c, indexingStatus: result.indexingStatus, indexingError: undefined }
            : c
        ));
      } else {
        alert(result.message || 'Unable to cancel indexing');
      }
    } catch (error) {
      console.error('Failed to cancel indexing:', error);
      alert('Failed to cancel indexing');
    } finally {
      setIndexingAction(null);
    }
  };

  const canRetryIndexing = (conversation: ConversationListItem): boolean => {
    const status = conversation.indexingStatus || 'none';
    return status === 'none' || status === 'failed';
  };

  const canCancelIndexing = (conversation: ConversationListItem): boolean => {
    const status = conversation.indexingStatus || 'none';
    return status === 'queued' || status === 'indexing';
  };

  const getIndexingStatusInfo = (status?: string) => {
    switch (status) {
      case 'none':
        return { label: 'Not indexed', color: 'secondary', icon: 'pi pi-circle' };
      case 'queued':
        return { label: 'Queued', color: 'info', icon: 'pi pi-clock' };
      case 'indexing':
        return { label: 'Indexing', color: 'warning', icon: 'pi pi-spin pi-spinner' };
      case 'indexed':
        return { label: 'Indexed', color: 'success', icon: 'pi pi-check-circle' };
      case 'failed':
        return { label: 'Failed', color: 'danger', icon: 'pi pi-exclamation-circle' };
      default:
        return { label: 'Unknown', color: 'secondary', icon: 'pi pi-question-circle' };
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Conversation History</h1>
          <p className="text-gray-600 dark:text-gray-300">Review and manage historical conversations</p>
        </div>
        <Button onClick={loadHistory} variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total Conversations</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <MessageSquare className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Active</p>
                <p className="text-2xl font-bold text-green-600">{stats.active}</p>
              </div>
              <Clock className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Closed</p>
                <p className="text-2xl font-bold text-gray-600">{stats.closed}</p>
              </div>
              <Calendar className="h-8 w-8 text-gray-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Conversations Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Conversations</CardTitle>
          <CardDescription>
            View and manage conversation history with indexing status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full table-auto">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-300">ID</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-300">User</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-300">Date</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-300">Status</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-300">Indexing</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-300">Messages</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody>
                {conversations.map((conversation) => {
                  const indexingInfo = getIndexingStatusInfo(conversation.indexingStatus);
                  return (
                    <tr key={conversation.id} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-sm text-gray-600 dark:text-gray-300">
                            {conversation.id.substring(0, 8)}...
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-2">
                          <User className="h-4 w-4 text-gray-400" />
                          <span className="text-sm text-gray-600 dark:text-gray-300">
                            {conversation.tokenNames?.[0] || 'Unknown'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-col">
                          <span className="text-sm text-gray-600 dark:text-gray-300">
                            {new Date(conversation.startedAt).toLocaleDateString()}
                          </span>
                          <span className="text-xs text-gray-400 dark:text-gray-500">
                            {new Date(conversation.startedAt).toLocaleTimeString()}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={
                          conversation.status === 'open' ? 'default' : 'secondary'
                        }>
                          {conversation.status === 'open' ? 'Active' : 'Closed'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={
                          indexingInfo.color === 'success' ? 'default' :
                          indexingInfo.color === 'warning' ? 'secondary' :
                          indexingInfo.color === 'danger' ? 'destructive' : 'secondary'
                        }>
                          {indexingInfo.label}
                        </Badge>
                        {conversation.indexingError && (
                          <p className="text-xs text-red-500 mt-1">
                            Error: {conversation.indexingError}
                          </p>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm text-gray-600 dark:text-gray-300">
                          {conversation.messageCount}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-2">
                          <Link to={`/admin/history/${conversation.id}`}>
                            <Button variant="outline" size="sm">
                              <Eye className="mr-2 h-4 w-4" />
                              View
                            </Button>
                          </Link>
                          
                          {conversation.status === 'open' && (
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleCloseConversation(conversation.id)}
                            >
                              <StopCircle className="mr-2 h-4 w-4" />
                              Close
                            </Button>
                          )}
                          
                          {canRetryIndexing(conversation) && (
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleRetryIndexing(conversation.id)}
                              disabled={indexingAction !== null}
                            >
                              <Play className="mr-2 h-4 w-4" />
                              Queue Indexing
                            </Button>
                          )}
                          
                          {canCancelIndexing(conversation) && (
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleCancelIndexing(conversation.id)}
                              disabled={indexingAction !== null}
                            >
                              <StopCircle className="mr-2 h-4 w-4" />
                              Cancel Indexing
                            </Button>
                          )}
                          
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteConversation(conversation.id)}
                            disabled={deletingId === conversation.id}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {deletingId === conversation.id ? 'Deleting...' : 'Delete'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                
                {conversations.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 px-4 text-center text-gray-500 dark:text-gray-400">
                      No conversations found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}