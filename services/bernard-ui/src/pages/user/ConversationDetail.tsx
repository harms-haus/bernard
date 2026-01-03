import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft } from 'lucide-react';
import { apiClient } from '@/services/api';
import type { ConversationMetadata, ConversationEvent } from '@/types/conversation';
import { useToast } from '@/components/ToastManager';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

const formatDateTime = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleString();
};

function mapEventTypeToRole(eventType: ConversationEvent['type']): string {
  switch (eventType) {
    case 'user_message':
      return 'user';
    case 'assistant_message':
    case 'llm_response':
      return 'assistant';
    case 'tool_response':
      return 'tool';
    default:
      return 'system';
  }
}

function extractEventContent(event: ConversationEvent): string {
  if (typeof event.data === 'string') {
    return event.data;
  }
  if (event.data && typeof event.data === 'object') {
    const data = event.data as Record<string, unknown>;
    if (data.content !== undefined) {
      if (typeof data.content === 'string') {
        return data.content;
      }
      return JSON.stringify(data.content, null, 2);
    }
    return JSON.stringify(data, null, 2);
  }
  return '';
}

export function ConversationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [conversation, setConversation] = useState<ConversationMetadata | null>(null);
  const [events, setEvents] = useState<ConversationEvent[]>([]);

  useEffect(() => {
    if (id) {
      loadConversation();
    }
  }, [id]);

  const loadConversation = async () => {
    if (!id) return;

    setLoading(true);
    try {
      const response = await apiClient.getConversation(id);
      setConversation(response.conversation);
      setEvents(response.events);
    } catch (error) {
      console.error('Failed to load conversation:', error);
      toast.error(
        'Load Failed',
        error instanceof Error ? error.message : 'Failed to load conversation'
      );
    } finally {
      setLoading(false);
    }
  };

  // Filter events to show only meaningful messages
  const displayEvents = events.filter(event => 
    event.type !== 'llm_call' && event.type !== 'tool_call'
  );

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
              The conversation you&apos;re looking for doesn&apos;t exist or has been deleted.
            </p>
            <Button>
              <Link to="/conversations" className="flex items-center">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Conversations
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
          <Button variant="outline" onClick={() => navigate('/conversations')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Conversations
          </Button>
          <div>
            <h1 className="text-3xl font-bold">
              {conversation.name || 'Conversation'}
            </h1>
            <p className="text-muted-foreground text-sm font-mono">
              {conversation.id}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Messages Display */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Conversation</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="flex flex-col gap-4 p-4 max-h-[600px] overflow-y-auto">
                {displayEvents.map((event, index) => (
                  <div
                    key={event.id || index}
                    className={cn(
                      "flex gap-3",
                      event.type === 'user_message' ? "flex-row-reverse" : "flex-row"
                    )}
                  >
                    <Avatar className="h-8 w-8 mt-1">
                      <AvatarFallback>
                        {event.type === 'user_message' ? 'U' : 
                         event.type === 'assistant_message' || event.type === 'llm_response' ? 'AI' : 
                         event.type === 'tool_response' ? 'T' : 'S'}
                      </AvatarFallback>
                    </Avatar>
                    <div className={cn(
                      "flex flex-col gap-1 max-w-[80%]",
                      event.type === 'user_message' ? "items-end" : "items-start"
                    )}>
                      <div className={cn(
                        "px-4 py-2 rounded-lg",
                        event.type === 'user_message' ? "bg-primary text-primary-foreground" : 
                        event.type === 'tool_response' ? "bg-muted font-mono text-sm" : "bg-muted"
                      )}>
                        <p className="whitespace-pre-wrap text-sm">
                          {extractEventContent(event)}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {mapEventTypeToRole(event.type)} • {new Date(event.timestamp).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
                {displayEvents.length === 0 && (
                  <p className="text-muted-foreground text-center py-8">No messages in this conversation</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Metadata Sidebar */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
              <CardDescription>Conversation metadata</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Created</span>
                  <p className="font-medium">{formatDateTime(conversation.createdAt)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Last Activity</span>
                  <p className="font-medium">
                    {formatDateTime(conversation.lastTouchedAt)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="text-center p-2 bg-secondary rounded">
                  <p className="font-medium">{conversation.messageCount}</p>
                  <p className="text-xs text-muted-foreground">Messages</p>
                </div>
                <div className="text-center p-2 bg-secondary rounded">
                  <p className="font-medium">{conversation.userAssistantCount}</p>
                  <p className="text-xs text-muted-foreground">LLM Calls</p>
                </div>
                <div className="text-center p-2 bg-secondary rounded">
                  <p className="font-medium">{conversation.toolCallCount}</p>
                  <p className="text-xs text-muted-foreground">Tools</p>
                </div>
              </div>

              {conversation.archived && (
                <Badge variant="secondary">Archived</Badge>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default ConversationDetail;
