import * as React from 'react';
import { useAuth } from '../hooks/useAuth';
import { apiClient } from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { ScrollArea } from '../components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Avatar, AvatarFallback } from '../components/ui/avatar';
import { Send, StopCircle, Loader2 } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export function Chat() {
  const { state } = useAuth();
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input, setInput] = React.useState('');
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const scrollAreaRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  React.useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!input.trim() || isStreaming) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setError(null);
    setIsStreaming(true);

    try {
      const stream = await apiClient.chatStream(
        messages.concat(userMessage).map(msg => ({
          role: msg.role,
          content: msg.content
        }))
      );

      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: ''
      };

      setMessages(prev => [...prev, assistantMessage]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf('\n\n');

        while (boundary !== -1) {
          const raw = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          
          const lines = raw.split('\n').filter((line) => line.startsWith('data:'));
          const payload = lines.map((line) => line.replace(/^data:\s*/, '')).join('');

          if (!payload || payload === '[DONE]') {
            break;
          }

          try {
            const chunk = JSON.parse(payload);
            const text = extractTextFromChunk(chunk);
            if (text) {
              assistantMessage = {
                ...assistantMessage,
                content: assistantMessage.content + text
              };
              
              setMessages(prev => {
                const updated = [...prev];
                const lastIndex = updated.length - 1;
                updated[lastIndex] = assistantMessage;
                return updated;
              });
            }
          } catch {
            // Ignore malformed chunks
          }
          
          boundary = buffer.indexOf('\n\n');
        }
      }
    } catch (err) {
      console.error('Chat error:', err);
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setIsStreaming(false);
    }
  };

  const handleStopStreaming = () => {
    // Note: In a real implementation, you would abort the stream here
    // For now, we'll just update the UI state
    setIsStreaming(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const extractTextFromChunk = (chunk: any): string | null => {
    const choice = chunk.choices?.[0];
    if (!choice) return null;

    const deltaContent = choice.delta?.content;
    if (typeof deltaContent === 'string') return deltaContent;

    const messageContent = choice.message?.content;
    if (typeof messageContent === 'string') return messageContent;

    return null;
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Avatar className="h-10 w-10">
                <AvatarFallback>B</AvatarFallback>
              </Avatar>
              <div>
                <div className="font-semibold">Bernard</div>
                <div className="text-sm text-gray-500">AI Assistant</div>
              </div>
            </div>
            <div className="text-sm text-gray-500">
              {state.user ? `Logged in as ${state.user.displayName}` : 'Not logged in'}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}
          
          <ScrollArea className="h-[60vh] border rounded-lg p-4" ref={scrollAreaRef}>
            {messages.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                Start a conversation with Bernard. Ask about the weather, set a timer, or search the web.
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${
                      message.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <div
                      className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                        message.role === 'user'
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-100 text-gray-900'
                      }`}
                    >
                      <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                    </div>
                  </div>
                ))}
                {isStreaming && (
                  <div className="flex justify-start">
                    <div className="bg-gray-100 text-gray-900 max-w-xs lg:max-w-md px-4 py-2 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Thinking...</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>

          <div className="flex items-end space-x-3">
            <div className="flex-1 space-y-2">
              <Input
                placeholder="Type your message..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                disabled={isStreaming}
                className="min-h-[44px]"
              />
              <div className="text-xs text-gray-500">
                Press Enter to send, Shift+Enter for a new line
              </div>
            </div>
            <div className="flex space-x-2">
              <Button
                onClick={handleSendMessage}
                disabled={!input.trim() || isStreaming}
                className="h-[44px] px-4"
              >
                <Send className="h-4 w-4 mr-2" />
                Send
              </Button>
              {isStreaming && (
                <Button
                  variant="outline"
                  onClick={handleStopStreaming}
                  className="h-[44px] px-4"
                >
                  <StopCircle className="h-4 w-4 mr-2" />
                  Stop
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}