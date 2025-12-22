import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import {
  ArrowLeft,
  Eye,
  Trash2,
  Play,
  StopCircle,
  RefreshCw,
  Settings,
  AlertCircle,
  Copy,
  Download
} from 'lucide-react';
import { adminApiClient } from '../../services/adminApi';
import { ChatInterface } from '../../components/ChatInterface';
import type { ConversationDetail, ConversationMessage } from '../../services/adminApi';
import type { MessageRecord } from '../../../../bernard/lib/conversation/types';
import { extractTraceEventsFromMessages } from '../../utils/traceEventParser';
import { useConfirmDialogPromise } from '../../hooks/useConfirmDialogPromise';
import { useToast } from '../../components/ToastManager';

const formatDateTime = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleString();
};

// Convert ConversationMessage[] to MessageRecord[] for ChatInterface compatibility
const convertMessagesForChatInterface = (messages: ConversationMessage[]): MessageRecord[] => {
  return messages
    .filter(message => {
      // Filter out system messages that contain trace content - these are not meant to be displayed as regular messages
      if (message.role === 'system' && typeof message.content === 'object' && message.content && 'type' in message.content) {
        const content = message.content as any;
        return !(content.type === 'llm_call' || content.type === 'llm_call_complete' ||
                 content.type === 'tool_call' || content.type === 'tool_call_complete');
      }
      return true;
    })
    .map(message => ({
      id: message.id,
      role: message.role,
      content: message.content,
      name: message.name,
      tool_call_id: message.tool_call_id,
      tool_calls: message.tool_calls,
      createdAt: message.createdAt,
      tokenDeltas: message.tokenDeltas,
      metadata: message.metadata
    }));
};

export default function ConversationDetail() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(false);
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [indexingAction, setIndexingAction] = useState<{ conversationId: string; action: 'retry' | 'cancel' } | null>(null);
  const [showDebug, setShowDebug] = useState(true);

  // Hook calls - must be at the top level of the component function
  const toast = useToast();
  const confirmDialog = useConfirmDialogPromise();

  // Calculate actual tool call count from messages
  const actualToolCallCount = messages.reduce((count, message) => {
    // Count tool messages
    if (message.role === 'tool') {
      return count + 1;
    }
    // Count system messages with tool_call type
    if (message.role === 'system' && typeof message.content === 'object' && message.content && 'type' in message.content) {
      const content = message.content as any;
      if (content.type === 'tool_call') {
        return count + 1;
      }
    }
    return count;
  }, 0);

  useEffect(() => {
    if (id) {
      loadConversation();
    }
  }, [id]);

  const loadConversation = async () => {
    if (!id) return;

    setLoading(true);
    try {
      const response = await adminApiClient.getConversation(id, 100);
      setConversation(response.conversation);
      setMessages(response.messages);
    } catch (error) {
      console.error('Failed to load conversation:', error);
      toast.error('Load Failed', error instanceof Error ? error.message : 'Failed to load conversation');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConversation = async () => {
    if (!id) return;

    const confirmed = await confirmDialog({
      title: 'Delete Conversation',
      description: 'Are you sure you want to permanently delete this conversation? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmVariant: 'destructive'
    });

    if (!confirmed) return;

    setDeletingId(id);
    try {
      await adminApiClient.deleteConversation(id);
      toast.success('Success', 'Conversation deleted successfully');
      // Navigate back to history
      window.history.back();
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      toast.error('Delete Failed', error instanceof Error ? error.message : 'Failed to delete conversation');
    } finally {
      setDeletingId(null);
    }
  };

  const handleCloseConversation = async () => {
    if (!id) return;

    try {
      await adminApiClient.closeConversation(id);
      setConversation(prev => prev ? { ...prev, status: 'closed' as const, closedAt: new Date().toISOString() } : null);
      toast.success('Success', 'Conversation closed successfully');
    } catch (error) {
      console.error('Failed to close conversation:', error);
      toast.error('Close Failed', error instanceof Error ? error.message : 'Failed to close conversation');
    }
  };

  const handleRetryIndexing = async () => {
    if (!id || indexingAction) return;

    setIndexingAction({ conversationId: id, action: 'retry' });
    try {
      const result = await adminApiClient.retryIndexing(id);
      if (result.success) {
        setConversation(prev => prev ? {
          ...prev,
          indexingStatus: result.indexingStatus,
          indexingAttempts: (prev.indexingAttempts || 0) + 1,
          indexingError: undefined
        } : null);
        toast.success('Success', 'Indexing queued successfully');
      } else {
        toast.error('Retry Failed', result.message || 'Unable to retry indexing');
      }
    } catch (error) {
      console.error('Failed to retry indexing:', error);
      toast.error('Retry Failed', error instanceof Error ? error.message : 'Failed to retry indexing');
    } finally {
      setIndexingAction(null);
    }
  };

  const handleCancelIndexing = async () => {
    if (!id || indexingAction) return;

    setIndexingAction({ conversationId: id, action: 'cancel' });
    try {
      const result = await adminApiClient.cancelIndexing(id);
      if (result.success) {
        setConversation(prev => prev ? {
          ...prev,
          indexingStatus: result.indexingStatus,
          indexingError: undefined
        } : null);
        toast.success('Success', 'Indexing cancelled successfully');
      } else {
        toast.error('Cancel Failed', result.message || 'Unable to cancel indexing');
      }
    } catch (error) {
      console.error('Failed to cancel indexing:', error);
      toast.error('Cancel Failed', error instanceof Error ? error.message : 'Failed to cancel indexing');
    } finally {
      setIndexingAction(null);
    }
  };

  const handleCopyConversationJson = async () => {
    try {
      const conversationData = {
        conversation,
        messages
      };
      const jsonContent = JSON.stringify(conversationData, null, 2);
      await navigator.clipboard.writeText(jsonContent);
      toast.success('Success', 'Conversation JSON copied to clipboard!');
    } catch (error) {
      console.error('Failed to copy conversation JSON:', error);
      toast.error('Copy Failed', error instanceof Error ? error.message : 'Failed to copy conversation JSON');
    }
  };

  const handleDownloadConversationJson = async () => {
    if (!conversation) return;

    try {
      const conversationData = {
        conversation,
        messages
      };
      const jsonContent = JSON.stringify(conversationData, null, 2);
      const blob = new Blob([jsonContent], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bernard-conversation-${conversation.id}-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download conversation JSON:', error);
      toast.error('Download Failed', error instanceof Error ? error.message : 'Failed to download conversation JSON');
    }
  };

  const canRetryIndexing = (): boolean => {
    if (!conversation) return false;
    if (conversation.ghost) return false; // Ghost conversations cannot be indexed
    const status = conversation.indexingStatus || 'none';
    return status === 'none' || status === 'failed';
  };

  const canCancelIndexing = (): boolean => {
    if (!conversation) return false;
    if (conversation.ghost) return false; // Ghost conversations cannot be indexed
    const status = conversation.indexingStatus || 'none';
    return status === 'queued' || status === 'indexing';
  };

  const getIndexingStatusInfo = (status?: string) => {
    switch (status) {
      case 'none':
        return { label: 'Not indexed', color: 'secondary' as const };
      case 'queued':
        return { label: 'Queued', color: 'info' as const };
      case 'indexing':
        return { label: 'Indexing', color: 'warning' as const };
      case 'indexed':
        return { label: 'Indexed', color: 'success' as const };
      case 'failed':
        return { label: 'Failed', color: 'destructive' as const };
      default:
        return { label: 'Unknown', color: 'secondary' as const };
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Conversation Not Found</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              The conversation you're looking for doesn't exist or has been deleted.
            </p>
            <Button>
              <Link to="/admin/history" className="flex items-center">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to History
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link to="/admin/history">
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to History
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Conversation Details</h1>
            <p className="text-gray-600 dark:text-gray-300">ID: {conversation.id}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Button onClick={handleCopyConversationJson} variant="outline" size="icon" title="Copy Conversation JSON">
            <Copy className="h-4 w-4" />
          </Button>
          <Button onClick={handleDownloadConversationJson} variant="outline" size="icon" title="Download Conversation JSON">
            <Download className="h-4 w-4" />
          </Button>
          <Button onClick={loadConversation} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button
            variant={showDebug ? "default" : "outline"}
            onClick={() => setShowDebug(!showDebug)}
          >
            <Settings className="mr-2 h-4 w-4" />
            {showDebug ? 'Hide' : 'Show'} Debug Info
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chat Interface */}
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-0 mt-6">
              <ChatInterface
                initialMessages={convertMessagesForChatInterface(messages)}
                initialTraceEvents={extractTraceEventsFromMessages(messages)}
                readOnly={true}
                height="h-auto"
              />
            </CardContent>
          </Card>
        </div>

        {/* Debug Information */}
        <div className={showDebug ? 'block' : 'hidden'}>
          <Card>
            <CardHeader>
              <CardTitle>Debug Information</CardTitle>
              <CardDescription>
                Conversation metadata and system information
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Summary */}
              {conversation.summary && (
                <div>
                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                    {conversation.summary}
                  </p>
                </div>
              )}

              {/* Basic Info */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Status</span>
                  <Badge variant={
                    conversation.status === 'open' ? 'default' : 'secondary'
                  }>
                    {conversation.status === 'open' ? 'Active' : 'Closed'}
                  </Badge>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Started</span>
                    <p className="font-medium">{formatDateTime(conversation.startedAt)}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Last Updated</span>
                    <p className="font-medium">{formatDateTime(conversation.lastTouchedAt)}</p>
                  </div>
                  {conversation.closedAt && (
                    <div className="col-span-2">
                      <span className="text-gray-500 dark:text-gray-400">Closed</span>
                      <p className="font-medium">{formatDateTime(conversation.closedAt)}</p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Messages</span>
                    <p className="font-medium">{conversation.messageCount}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Tool Calls</span>
                    <p className="font-medium">{actualToolCallCount}</p>
                  </div>
                </div>
              </div>

              {/* Indexing Status */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Indexing Status</span>
                  {conversation.ghost ? (
                    <Badge variant="outline">
                      Not Indexed (Ghost)
                    </Badge>
                  ) : (
                    <Badge variant={
                      getIndexingStatusInfo(conversation.indexingStatus).color === 'success' ? 'default' :
                      getIndexingStatusInfo(conversation.indexingStatus).color === 'warning' ? 'secondary' :
                      getIndexingStatusInfo(conversation.indexingStatus).color === 'destructive' ? 'destructive' : 'secondary'
                    }>
                      {getIndexingStatusInfo(conversation.indexingStatus).label}
                    </Badge>
                  )}
                </div>

                {conversation.ghost && (
                  <div className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-3 rounded border border-amber-200 dark:border-amber-800">
                    <div className="flex items-center space-x-2">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      <span className="font-medium">Ghost Conversation</span>
                    </div>
                    <p className="mt-1 text-xs">
                      This conversation was created in ghost mode and cannot be indexed for privacy reasons.
                    </p>
                  </div>
                )}
                
                {conversation.indexingAttempts && (
                  <div className="text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Attempts</span>
                    <p className="font-medium">{conversation.indexingAttempts}</p>
                  </div>
                )}
                
                {conversation.indexingError && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
                    <div className="flex items-center space-x-2">
                      <AlertCircle className="h-4 w-4 text-red-500" />
                      <span className="text-sm font-medium text-red-700 dark:text-red-300">Indexing Error</span>
                    </div>
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">{conversation.indexingError}</p>
                  </div>
                )}
                
                <div className="flex space-x-2">
                  {canRetryIndexing() && (
                    <Button 
                      size="sm"
                      onClick={handleRetryIndexing}
                      disabled={indexingAction !== null}
                    >
                      <Play className="mr-2 h-4 w-4" />
                      Queue Indexing
                    </Button>
                  )}
                  
                  {canCancelIndexing() && (
                    <Button 
                      size="sm"
                      variant="outline"
                      onClick={handleCancelIndexing}
                      disabled={indexingAction !== null}
                    >
                      <StopCircle className="mr-2 h-4 w-4" />
                      Cancel Indexing
                    </Button>
                  )}
                </div>
              </div>

              {/* Source and Tokens */}
              <div className="space-y-4">
                <div>
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Source</span>
                  <p className="font-medium">{conversation.source}</p>
                </div>
                
                <div>
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Tokens</span>
                  <div className="mt-2 space-y-1">
                    {conversation.tokenNames?.map((tokenName, index) => (
                      <div key={index} className="flex items-center justify-between p-2 border border-gray-200 dark:border-gray-700 rounded">
                        <span className="text-sm">{tokenName}</span>
                        <Badge variant="outline">Active</Badge>
                      </div>
                    ))}
                    {conversation.tokenNames?.length === 0 && (
                      <p className="text-sm text-gray-500 dark:text-gray-400">No tokens</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Models and Tags */}
              <div className="space-y-4">
                <div>
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Models Used</span>
                  <div className="mt-2 space-y-1">
                    {conversation.modelSet?.map((model, index) => (
                      <Badge key={index} variant="secondary" className="mr-2">
                        {model}
                      </Badge>
                    ))}
                    {conversation.modelSet?.length === 0 && (
                      <p className="text-sm text-gray-500 dark:text-gray-400">No models</p>
                    )}
                  </div>
                </div>
                
                <div>
                  <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Tags</span>
                  <div className="mt-2 space-y-1">
                    {conversation.tags?.map((tag, index) => (
                      <Badge key={index} variant="outline" className="mr-2">
                        {tag}
                      </Badge>
                    ))}
                    {conversation.tags?.length === 0 && (
                      <p className="text-sm text-gray-500 dark:text-gray-400">No tags</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-3">
                <Button
                  className="w-full"
                  onClick={() => window.open(`/admin/history/${conversation.id}`, '_blank')}
                >
                  <Eye className="mr-2 h-4 w-4" />
                  Open in New Tab
                </Button>


                {conversation.status === 'open' && (
                  <Button 
                    className="w-full"
                    variant="outline"
                    onClick={handleCloseConversation}
                  >
                    <StopCircle className="mr-2 h-4 w-4" />
                    Close Conversation
                  </Button>
                )}
                
                <Button 
                  className="w-full"
                  variant="destructive"
                  onClick={handleDeleteConversation}
                  disabled={deletingId === conversation.id}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {deletingId === conversation.id ? 'Deleting...' : 'Delete Conversation'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}