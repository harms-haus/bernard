import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft } from 'lucide-react';
import { apiClient } from '@/services/api';
import { ChatInterface } from '@/components/ChatInterface';
import type { ConversationMetadata, ConversationEvent } from '@/types/conversation';
import type { MessageRecord } from '../../../../bernard/lib/conversation/types';
import { useToast } from '@/components/ToastManager';

const formatDateTime = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleString();
};

// Convert ConversationEvent[] to MessageRecord[] for ChatInterface compatibility
const convertEventsForChatInterface = (events: ConversationEvent[]): MessageRecord[] => {
  return events
    .filter((event) => {
      // Filter out events that aren't meant to be displayed as regular messages
      if (event.type === 'llm_call' || event.type === 'tool_call') {
        return false;
      }
      return true;
    })
    .map((event) => {
      const messageRecord: MessageRecord = {
        id: event.id,
        role: mapEventTypeToRole(event.type),
        content: extractContent(event),
        createdAt: event.timestamp,
        metadata: event.data as Record<string, unknown>,
      };

      // Handle tool responses
      if (event.type === 'tool_response' && event.data) {
        const data = event.data as Record<string, unknown>;
        if (data.tool_call_id) {
          messageRecord.tool_call_id = data.tool_call_id as string;
        }
        if (data.tool_name) {
          messageRecord.name = data.tool_name as string;
        }
      }

      // Handle LLM responses with tool calls
      if (event.type === 'llm_response' && event.data) {
        const data = event.data as Record<string, unknown>;
        if (data.tool_calls) {
          messageRecord.tool_calls = data.tool_calls as unknown[];
        }
      }

      return messageRecord;
    });
};

const mapEventTypeToRole = (
  eventType: ConversationEvent['type']
): MessageRecord['role'] => {
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
};

const extractContent = (event: ConversationEvent): string | Record<string, unknown> => {
  if (typeof event.data === 'string') {
    return event.data;
  }

  if (event.data && typeof event.data === 'object') {
    const data = event.data as Record<string, unknown>;
    // Try to find a content field
    if (data.content !== undefined) {
      if (typeof data.content === 'string') {
        return data.content;
      }
      return data.content as Record<string, unknown>;
    }
    // Otherwise return the whole data object as JSON
    return data;
  }

  return '';
};

export function ConversationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [conversation, setConversation] = useState<ConversationMetadata | null>(null);
  const [messages, setMessages] = useState<MessageRecord[]>([]);

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
      setMessages(convertEventsForChatInterface(response.events));
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
        {/* Chat Interface */}
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-0 mt-6">
              <ChatInterface
                key={conversation.id}
                initialMessages={messages}
                initialTraceEvents={[]}
                readOnly={true}
                height="h-auto"
              />
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
