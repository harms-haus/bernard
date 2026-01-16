"use client";

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft,
  Clock,
  Play,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  MessageSquare,
  Check
} from 'lucide-react';
import { redirectIfNotAuthenticated } from '@/lib/auth/client-helpers';

interface Task {
  id: string;
  name: string;
  status: 'queued' | 'running' | 'completed' | 'errored' | 'uncompleted' | 'cancelled';
  toolName: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  runtimeMs?: number;
  errorMessage?: string;
  messageCount: number;
  toolCallCount: number;
  tokensIn: number;
  tokensOut: number;
  archived: boolean;
}

interface TaskEvent {
  type: string;
  timestamp: string;
  data: Record<string, unknown>;
}

interface TaskDetailResponse {
  task: Task;
  events: TaskEvent[];
  sections: Record<string, { name: string; description: string; content: string }>;
  messages: Array<{
    id: string;
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    createdAt: string;
    name?: string;
    tool_call_id?: string;
    tool_calls?: Array<{
      id: string;
      type: string;
      function: {
        name: string;
        arguments: string;
      };
    }>;
  }>;
}

// Task Event Message Block Components
const TaskStartedBlock = ({ event, formatDate }: { event: TaskEvent; formatDate: (date: string) => string }) => (
  <div className="border-l-4 border-green-500 bg-green-50 dark:bg-green-950/20 pl-4 py-3">
    <div className="flex items-center space-x-2 mb-2">
      <div className="flex items-center space-x-2">
        <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
          <Play className="w-3 h-3 text-white ml-0.5" />
        </div>
        <span className="text-sm font-medium text-green-800 dark:text-green-200">Task Started</span>
      </div>
      <span className="text-xs text-green-600 dark:text-green-400">
        {formatDate(event.timestamp)}
      </span>
    </div>
    <div className="text-sm text-green-700 dark:text-green-300">
      The background task has begun execution.
    </div>
  </div>
);

const TaskMessageBlock = ({ event, formatDate }: { event: TaskEvent; formatDate: (date: string) => string }) => (
  <div className="border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-950/20 pl-4 py-3">
    <div className="flex items-center space-x-2 mb-2">
      <div className="flex items-center space-x-2">
        <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
          <MessageSquare className="w-3 h-3 text-white" />
        </div>
        <span className="text-sm font-medium text-blue-800 dark:text-blue-200">Task Message</span>
      </div>
      <span className="text-xs text-blue-600 dark:text-blue-400">
        {formatDate(event.timestamp)}
      </span>
    </div>
    <div className="text-sm text-blue-700 dark:text-blue-300">
      {event.data.content && typeof event.data.content === 'string' ? event.data.content : 'A message was recorded during task execution.'}
    </div>
  </div>
);

const TaskCompletedBlock = ({ event, formatDate }: { event: TaskEvent; formatDate: (date: string) => string }) => (
  <div className="border-l-4 border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20 pl-4 py-3">
    <div className="flex items-center space-x-2 mb-2">
      <div className="flex items-center space-x-2">
        <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center">
          <Check className="w-3 h-3 text-white" />
        </div>
        <span className="text-sm font-medium text-emerald-800 dark:text-emerald-200">Task Completed</span>
      </div>
      <span className="text-xs text-emerald-600 dark:text-emerald-400">
        {formatDate(event.timestamp)}
      </span>
    </div>
    <div className="text-sm text-emerald-700 dark:text-emerald-300">
      The background task has finished successfully.
    </div>
  </div>
);

export default async function TaskDetail() {
  const _ = await redirectIfNotAuthenticated();
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(false);
  const [task, setTask] = useState<Task | null>(null);
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [sections, setSections] = useState<Record<string, { name: string; description: string; content: string }>>({});
  const [messages, setMessages] = useState<TaskDetailResponse['messages']>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      loadTask();
    }
  }, [id]);

  const loadTask = async () => {
    if (!id) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/tasks/${id}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to load task');
      }

      const data: TaskDetailResponse = await response.json();
      setTask(data.task);
      setEvents(data.events);
      setSections(data.sections);
      setMessages(data.messages);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: Task['status']) => {
    switch (status) {
      case 'queued':
        return <Clock className="w-5 h-5 text-orange-500" />;
      case 'running':
        return <Play className="w-5 h-5 text-blue-500" />;
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'errored':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'uncompleted':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
      case 'cancelled':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusBadgeVariant = (status: Task['status']) => {
    switch (status) {
      case 'queued':
        return 'outline';
      case 'running':
        return 'default';
      case 'completed':
        return 'secondary';
      case 'errored':
        return 'destructive';
      case 'uncompleted':
        return 'outline';
      case 'cancelled':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return 'N/A';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="max-w-6xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-48"></div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 h-96 bg-gray-200 rounded"></div>
              <div className="h-96 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="max-w-6xl mx-auto">
          <Card>
            <CardContent className="p-6">
              <div className="text-center text-red-600">
                {error || 'Task not found'}
              </div>
              <div className="text-center mt-4">
                <Link href="/bernard/tasks">
                  <Button variant="outline">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Tasks
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <Link href="/bernard/tasks">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Tasks
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold flex items-center space-x-2">
                {getStatusIcon(task.status)}
                <span>{task.name}</span>
              </h1>
              <p className="text-gray-600">Task ID: {task.id}</p>
            </div>
          </div>
          <Button onClick={loadTask} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content - Execution Log */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Execution Log</CardTitle>
                <CardDescription>
                  Real-time execution events and messages
                </CardDescription>
              </CardHeader>
              <CardContent>
                {events.length === 0 && messages.length === 0 ? (
                  <div className="text-center text-gray-500 py-8">
                    No execution data available yet.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Events */}
                    {events.map((event, index) => {
                      // Use specific message blocks for known event types
                      if (event.type === 'task_started') {
                        return <TaskStartedBlock key={index} event={event} formatDate={formatDate} />;
                      }
                      if (event.type === 'message_recorded') {
                        return <TaskMessageBlock key={index} event={event} formatDate={formatDate} />;
                      }
                      if (event.type === 'task_completed') {
                        return <TaskCompletedBlock key={index} event={event} formatDate={formatDate} />;
                      }

                      // Default event rendering for other event types
                      return (
                        <div key={index} className="border-l-2 border-gray-200 dark:border-gray-700 pl-4">
                          <div className="flex items-center space-x-2 mb-1">
                            <Badge variant="outline" className="text-xs">
                              {event.type}
                            </Badge>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {formatDate(event.timestamp)}
                            </span>
                          </div>
                          <pre className="text-sm bg-gray-50 dark:bg-gray-800 p-2 rounded overflow-x-auto">
                            {JSON.stringify(event.data, null, 2)}
                          </pre>
                        </div>
                      );
                    })}

                    {/* Messages */}
                    {messages.map((message) => (
                      <div key={message.id} className="border-l-2 border-blue-200 dark:border-blue-700 pl-4">
                        <div className="flex items-center space-x-2 mb-1">
                          <Badge variant="secondary" className="text-xs">
                            {message.role}
                          </Badge>
                          {message.name && (
                            <Badge variant="outline" className="text-xs">
                              {message.name}
                            </Badge>
                          )}
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {formatDate(message.createdAt)}
                          </span>
                        </div>
                        <div className="text-sm text-gray-900 dark:text-gray-100">
                          {typeof message.content === 'string'
                            ? message.content
                            : JSON.stringify(message.content, null, 2)
                          }
                        </div>
                        {message.tool_calls && message.tool_calls.length > 0 && (
                          <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                            <div>Tool calls:</div>
                            {message.tool_calls.map((call, i) => (
                              <div key={i} className="ml-2">
                                {call.function.name}({call.function.arguments})
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar - Task Metadata */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle>Task Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Status</label>
                  <div className="flex items-center space-x-2 mt-1">
                    {getStatusIcon(task.status)}
                    <Badge variant={getStatusBadgeVariant(task.status)}>
                      {task.status}
                    </Badge>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700">Tool</label>
                  <div className="mt-1">
                    <Badge variant="outline">{task.toolName}</Badge>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700">Created</label>
                  <div className="mt-1 text-sm text-gray-600">
                    {formatDate(task.createdAt)}
                  </div>
                </div>

                {task.startedAt && (
                  <div>
                    <label className="text-sm font-medium text-gray-700">Started</label>
                    <div className="mt-1 text-sm text-gray-600">
                      {formatDate(task.startedAt)}
                    </div>
                  </div>
                )}

                {task.completedAt && (
                  <div>
                    <label className="text-sm font-medium text-gray-700">Completed</label>
                    <div className="mt-1 text-sm text-gray-600">
                      {formatDate(task.completedAt)}
                    </div>
                  </div>
                )}

                {task.runtimeMs && (
                  <div>
                    <label className="text-sm font-medium text-gray-700">Runtime</label>
                    <div className="mt-1 text-sm text-gray-600">
                      {formatDuration(task.runtimeMs)}
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium text-gray-700">Statistics</label>
                  <div className="mt-1 space-y-1 text-sm text-gray-600">
                    <div>{task.toolCallCount} tool calls</div>
                    <div>{task.messageCount} messages</div>
                    <div>{task.tokensIn} input tokens</div>
                    <div>{task.tokensOut} output tokens</div>
                  </div>
                </div>

                {task.errorMessage && (
                  <div>
                    <label className="text-sm font-medium text-gray-700">Error</label>
                    <div className="mt-1 text-sm text-red-600 bg-red-50 p-2 rounded">
                      {task.errorMessage}
                    </div>
                  </div>
                )}

                {task.archived && (
                  <div>
                    <Badge variant="outline">Archived</Badge>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Sections */}
            {Object.keys(sections).length > 0 && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle>Sections</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(sections).map(([key, section]) => (
                      <div key={key}>
                        <div className="font-medium text-sm">{section.name}</div>
                        {section.description && (
                          <div className="text-xs text-gray-600">{section.description}</div>
                        )}
                        {section.content && (
                          <div className="text-sm mt-1 bg-gray-50 dark:bg-gray-800 p-2 rounded">
                            {section.content}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
