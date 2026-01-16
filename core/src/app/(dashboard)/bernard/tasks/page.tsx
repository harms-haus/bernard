"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Eye,
  RefreshCw,
  MoreVertical,
  Loader2
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useConfirmDialog } from '@/components/DialogManager';
import { AuthProvider } from '@/hooks/useAuth';
import { DarkModeProvider } from '@/hooks/useDarkMode';

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

interface TasksResponse {
  tasks: Task[];
  total: number;
  hasMore: boolean;
}

function TasksContent() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hook calls - must be at the top level of the component function
  const confirmDialog = useConfirmDialog();

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        includeArchived: String(includeArchived),
        limit: '50'
      });

      const response = await fetch(`/api/tasks?${params}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to fetch tasks');
      }

      const data: TasksResponse = await response.json();
      setTasks(data.tasks);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [includeArchived]);

  const formatDuration = (ms?: number) => {
    if (!ms) return 'N/A';
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ${seconds % 60}s`;
  };


  const handleCancelTask = async (taskId: string) => {
    confirmDialog({
      title: 'Cancel this task?',
      description: 'This will stop the task execution. The task will be marked as cancelled and cannot be resumed.',
      confirmVariant: 'destructive',
      confirmText: 'Cancel Task',
      cancelText: 'Keep Running',
      onConfirm: async () => {
        try {
          const response = await fetch('/api/tasks', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({ action: 'cancel', taskId }),
          });

          if (!response.ok) {
            throw new Error('Failed to cancel task');
          }

          // Refresh the tasks list
          await fetchTasks();
        } catch (error) {
          console.error('Error cancelling task:', error);
          setError(error instanceof Error ? error.message : 'Failed to cancel task');
        }
      }
    });
  };

  const handleDeleteTask = async (taskId: string) => {
    confirmDialog({
      title: 'Delete this task?',
      description: 'This action cannot be undone. All task data and execution history will be permanently removed.',
      confirmVariant: 'destructive',
      confirmText: 'Delete Task',
      cancelText: 'Cancel',
      onConfirm: async () => {
        try {
          const response = await fetch(`/api/tasks?taskId=${taskId}`, {
            method: 'DELETE',
            credentials: 'include',
          });

          if (!response.ok) {
            throw new Error('Failed to delete task');
          }

          // Refresh the tasks list
          await fetchTasks();
        } catch (error) {
          console.error('Error deleting task:', error);
          setError(error instanceof Error ? error.message : 'Failed to delete task');
        }
      }
    });
  };

  // Animated status icon component
  const AnimatedStatusIcon = ({ status }: { status: Task['status'] }) => {
    switch (status) {
      case 'queued':
        return (
          <div className="relative">
            <Clock className="w-4 h-4 text-orange-500 animate-pulse" aria-label="Queued" />
          </div>
        );
      case 'running':
        return (
          <div className="relative">
            <Loader2 className="w-4 h-4 text-blue-500 animate-spin" aria-label="Running" />
          </div>
        );
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" aria-label="Completed" />;
      case 'errored':
        return <XCircle className="w-4 h-4 text-red-500" aria-label="Errored" />;
      case 'uncompleted':
        return <AlertCircle className="w-4 h-4 text-yellow-500" aria-label="Uncompleted" />;
      case 'cancelled':
        return <AlertCircle className="w-4 h-4 text-yellow-500" aria-label="Cancelled" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" aria-label="Unknown status" />;
    }
  };

  if (loading) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="max-w-6xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-48"></div>
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-24 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-6 sm:px-0">
        <div className="max-w-6xl mx-auto">
          <Card>
            <CardContent className="p-6">
              <div className="text-center text-red-600">
                Error loading tasks: {error}
              </div>
              <div className="text-center mt-4">
                <Button onClick={fetchTasks}>Try Again</Button>
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
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Tasks</h1>
            <p className="text-gray-600 dark:text-gray-300">Monitor background task execution and status</p>
          </div>
          <div className="flex items-center space-x-4">
            <Button
              onClick={() => setIncludeArchived(!includeArchived)}
              variant={includeArchived ? "default" : "outline"}
              size="sm"
            >
              {includeArchived ? "Hide Archived" : "Show Archived"}
            </Button>
            <Button onClick={fetchTasks} variant="outline">
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Background Tasks</CardTitle>
            <CardDescription>
              View and manage background task execution history
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 py-3 px-0 font-semibold text-gray-600 dark:text-gray-300"></TableHead>
                    <TableHead className="text-left py-3 px-0 font-semibold text-gray-600 dark:text-gray-300"></TableHead>
                    <TableHead className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-300">Task</TableHead>
                    <TableHead className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-300">Tool</TableHead>
                    <TableHead className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-300">Created</TableHead>
                    <TableHead className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-300">Runtime</TableHead>
                    <TableHead className="text-left py-3 px-4 font-semibold text-gray-600 dark:text-gray-300">Stats</TableHead>
                    <TableHead className="text-center py-3 px-0 font-semibold text-gray-600 dark:text-gray-300"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.map((task) => (
                    <TableRow key={task.id} className="border-b border-gray-100 dark:border-gray-800">
                      <TableCell className="py-3 px-0">
                        <Link href={`/bernard/tasks/${task.id}`}>
                          <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                      </TableCell>
                      <TableCell className="py-3 px-0">
                        <div className="flex items-center space-x-2">
                          <AnimatedStatusIcon status={task.status} />
                        </div>
                      </TableCell>
                      <TableCell className="py-3 px-4">
                        <div className="flex flex-col">
                          <span className="font-medium text-gray-900 dark:text-white">{task.name}</span>
                          {task.archived && (
                            <Badge variant="outline" className="w-fit mt-1">Archived</Badge>
                          )}
                          {task.errorMessage && (
                            <span className="text-sm text-red-600 mt-1 truncate max-w-xs">
                              Error: {task.errorMessage}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-3 px-4">
                        <span className="text-sm text-gray-600 dark:text-gray-300">{task.toolName}</span>
                      </TableCell>
                      <TableCell className="py-3 px-4">
                        <div className="flex flex-col">
                          <span className="text-sm text-gray-600 dark:text-gray-300">
                            {new Date(task.createdAt).toLocaleDateString()}
                          </span>
                          <span className="text-xs text-gray-400 dark:text-gray-500">
                            {new Date(task.createdAt).toLocaleTimeString()}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-3 px-4">
                        <span className="text-sm text-gray-600 dark:text-gray-300">
                          {formatDuration(task.runtimeMs)}
                        </span>
                      </TableCell>
                      <TableCell className="py-3 px-4">
                        <div className="flex flex-col text-xs text-gray-500 dark:text-gray-400">
                          <span>{task.toolCallCount} calls</span>
                          <span>{task.messageCount} msgs</span>
                          <span>{task.tokensIn + task.tokensOut} tokens</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-3 px-0 text-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {(task.status === 'queued' || task.status === 'running') && (
                              <DropdownMenuItem onClick={() => handleCancelTask(task.id)}>
                                Cancel
                              </DropdownMenuItem>
                            )}
                            {(task.status === 'completed' || task.status === 'errored' || task.status === 'uncompleted' || task.status === 'cancelled' || task.archived) && (
                              <DropdownMenuItem
                                onClick={() => handleDeleteTask(task.id)}
                                className="text-red-600 focus:text-red-600"
                              >
                                Delete
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}

                  {tasks.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8 px-4 text-center text-gray-500 dark:text-gray-400">
                        No tasks found. Tasks will appear here when you use tools that create background operations.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function Tasks() {
  return (
    <AuthProvider>
      <DarkModeProvider>
        <TasksContent />
      </DarkModeProvider>
    </AuthProvider>
  );
}
