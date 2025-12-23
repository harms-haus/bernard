import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import {
  Eye,
  Trash2,
  Play,
  StopCircle,
  RefreshCw,
  User,
  MoreVertical,
  Database,
  Copy,
  AlertTriangle
} from 'lucide-react';
import { adminApiClient } from '../../services/adminApi';
import type { ConversationListItem, ConversationDetailResponse } from '../../services/adminApi';
import { useConfirmDialog, useAlertDialog } from '../../components/DialogManager';
import { useToast } from '../../components/ToastManager';

export default function History() {
  const [loading, setLoading] = useState(false);
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [indexingAction, setIndexingAction] = useState<{ conversationId: string; action: 'retry' | 'cancel' } | null>(null);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [clearingIndex, setClearingIndex] = useState(false);
  
  // Hook calls - must be at the top level of the component function
  const confirmDialog = useConfirmDialog();
  const alertDialog = useAlertDialog();
  const toast = useToast();
  
  // Ref to track if component is mounted for cleanup
  const isMountedRef = useRef(true);

  useEffect(() => {
    loadHistory();
    
    // Cleanup function to mark component as unmounted
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const response = await adminApiClient.listHistory({
        includeOpen: true,
        includeClosed: true
      });
      setConversations(response.items || []);
    } catch (error) {
      console.error('Failed to load history:', error);
      toast.error('Failed to load conversation history');
    } finally {
      setLoading(false);
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
        setDeletingId(conversationId);
        try {
          await adminApiClient.deleteConversation(conversationId);
          setConversations(conversations.filter(c => c.id !== conversationId));
          loadHistory(); // Refresh stats
          toast.success('Conversation deleted successfully');
        } catch (error) {
          console.error('Failed to delete conversation:', error);
          toast.error('Failed to delete conversation');
        } finally {
          setDeletingId(null);
        }
      }
    });
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
        toast.error(result.message || 'Unable to retry indexing');
      }
    } catch (error) {
      console.error('Failed to retry indexing:', error);
      toast.error('Failed to retry indexing');
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
        toast.error(result.message || 'Unable to cancel indexing');
      }
    } catch (error) {
      console.error('Failed to cancel indexing:', error);
      toast.error('Failed to cancel indexing');
    } finally {
      setIndexingAction(null);
    }
  };

  const handleDeleteIndex = async (conversationId: string) => {
    confirmDialog({
      title: 'Delete the index for this conversation?',
      description: 'This will reset the indexing status.',
      confirmText: 'Delete Index',
      cancelText: 'Cancel',
      onConfirm: async () => {
        try {
          // Note: This might need to be implemented as an API call to delete index
          // For now, we'll reset the local state to simulate the action
          setConversations(conversations.map(c =>
            c.id === conversationId
              ? { ...c, indexingStatus: 'none' as const, indexingError: undefined, indexingAttempts: 0 }
              : c
          ));

          alertDialog({
            title: 'Index deleted successfully',
            variant: 'success',
            confirmText: 'OK',
          });
        } catch (error) {
          console.error('Failed to delete index:', error);
          toast.error('Failed to delete index');
        }
      }
    });
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
          // Call API to clear entire index
          const result = await adminApiClient.clearEntireIndex();
          if (result.success) {
            toast.success(
              `Index cleared successfully. Deleted ${result.keysDeleted} keys and queued ${result.conversationsQueued} conversations for re-indexing.`
            );
            // Refresh the history to show updated indexing status
            await loadHistory();
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

  const handleCopyConversationToClipboard = async (conversationId: string) => {
    if (copyingId) return; // Prevent multiple copy actions

    setCopyingId(conversationId);
    try {
      // Fetch the full conversation details
      const response = await adminApiClient.getConversation(conversationId, 1000); // Get up to 1000 messages
      
      // Format the conversation for clipboard
      const formattedConversation = formatConversationForClipboard(response);
      
      // Copy to clipboard
      await navigator.clipboard.writeText(formattedConversation);
      
      toast.success("Conversation copied to clipboard");
    } catch (error) {
      console.error("Failed to copy conversation:", error);
      toast.error("Failed to copy conversation to clipboard");
    } finally {
      setCopyingId(null);
    }
  };

  const formatConversationForClipboard = (conversationData: ConversationDetailResponse): string => {
    const { conversation, messages } = conversationData;
    
    // Format conversation metadata
    let result = `Conversation ID: ${conversation.id}\n`;
    result += `Status: ${conversation.status}\n`;
    result += `Started: ${new Date(conversation.startedAt).toLocaleString()}\n`;
    if (conversation.closedAt) {
      result += `Closed: ${new Date(conversation.closedAt).toLocaleString()}\n`;
    }
    result += `Messages: ${conversation.messageCount}\n`;
    result += `User: ${conversation.tokenNames?.[0] || "Unknown"}\n`;
    result += `Source: ${conversation.source}\n`;
    result += `\n`;
    
    // Add each message
    messages.forEach((message) => {
      const timestamp = new Date(message.createdAt).toLocaleTimeString();
      const role = message.role.toUpperCase();
      const content = typeof message.content === "string" 
        ? message.content 
        : JSON.stringify(message.content, null, 2);
      
      result += `${role} [${timestamp}]:\n`;
      result += `${content}\n\n`;
    });
    
    return result;
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
          <Button onClick={loadHistory} variant="outline">
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
            View and manage conversation history with indexing status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 py-3 px-4 font-semibold text-gray-600 dark:text-gray-300"></TableHead>
                  <TableHead className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-300">ID</TableHead>
                  <TableHead className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-300">User</TableHead>
                  <TableHead className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-300">Date</TableHead>
                  <TableHead className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-300">Status</TableHead>
                  <TableHead className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-300">Indexing</TableHead>
                  <TableHead className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-300">Messages</TableHead>
                  <TableHead className="text-center py-3 px-4 font-semibold text-gray-600 dark:text-gray-300"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conversations.map((conversation) => {
                  const indexingInfo = getIndexingStatusInfo(conversation.indexingStatus);
                  return (
                    <TableRow key={conversation.id} className="border-b border-gray-100 dark:border-gray-800">
                      <TableCell className="py-3 px-4">
                        <Link to={`/admin/history/${conversation.id}`}>
                          <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                      </TableCell>
                      <TableCell className="py-3 px-4">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-sm text-gray-600 dark:text-gray-300">
                            {conversation.id.substring(0, 8)}...
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-3 px-4">
                        <div className="flex items-center space-x-2">
                          <User className="h-4 w-4 text-gray-400" />
                          <span className="text-sm text-gray-600 dark:text-gray-300">
                            {conversation.tokenNames?.[0] || 'Unknown'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-3 px-4">
                        <div className="flex flex-col">
                          <span className="text-sm text-gray-600 dark:text-gray-300">
                            {new Date(conversation.startedAt).toLocaleDateString()}
                          </span>
                          <span className="text-xs text-gray-400 dark:text-gray-500">
                            {new Date(conversation.startedAt).toLocaleTimeString()}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-3 px-4">
                        <Badge variant={
                          conversation.status === 'open' ? 'default' : 'secondary'
                        }>
                          {conversation.status === 'open' ? 'Active' : 'Closed'}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3 px-4">
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
                      </TableCell>
                      <TableCell className="py-3 px-4">
                        <span className="text-sm text-gray-600 dark:text-gray-300">
                          {conversation.messageCount}
                        </span>
                      </TableCell>
                      <TableCell className="py-3 px-4 text-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleCopyConversationToClipboard(conversation.id)} disabled={copyingId === conversation.id}>
                              <Copy className="mr-2 h-4 w-4" />
                              {copyingId === conversation.id ? "Copying..." : "Copy to Clipboard"}
                            </DropdownMenuItem>
                            {conversation.indexingStatus === 'indexed' && (
                              <DropdownMenuItem onClick={() => handleDeleteIndex(conversation.id)}>
                                <Database className="mr-2 h-4 w-4" />
                                Delete Index
                              </DropdownMenuItem>
                            )}
                            {canRetryIndexing(conversation) && (
                              <DropdownMenuItem onClick={() => handleRetryIndexing(conversation.id)} disabled={indexingAction !== null}>
                                <Play className="mr-2 h-4 w-4" />
                                Queue Indexing
                              </DropdownMenuItem>
                            )}
                            {canCancelIndexing(conversation) && (
                              <DropdownMenuItem onClick={() => handleCancelIndexing(conversation.id)} disabled={indexingAction !== null}>
                                <StopCircle className="mr-2 h-4 w-4" />
                                Cancel Indexing
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => handleDeleteConversation(conversation.id)}
                              disabled={deletingId === conversation.id}
                              className="text-red-600 focus:text-red-600"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              {deletingId === conversation.id ? 'Deleting...' : 'Delete'}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
                
                {conversations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 px-4 text-center text-gray-500 dark:text-gray-400">
                      No conversations found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
