import { useState, useEffect } from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import {
  MoreVertical,
  Play,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Eye,
  EyeOff,
  Server,
  Database,
  Cpu,
  Mic,
  Volume2,
  Monitor,
  Globe,
  Activity
} from 'lucide-react';
import { useToast } from './ToastManager';
import { useAuth } from '../hooks/useAuth';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

interface Service {
  name: string;
  port: number;
  description: string;
  status: 'online' | 'degraded' | 'offline';
  error?: string;
  logs?: string[];
}

interface StatusData {
  status: 'online' | 'degraded' | 'offline';
  uptimeSeconds: number;
  startedAt: string;
  version?: string;
  lastActivityAt: string;
  activeConversations: number;
  tokensActive: number;
  queueSize: number;
  notes?: string;
  services?: Service[];
}

interface StatusDashboardProps {
  showRestartButtons?: boolean;
  showLogs?: boolean;
}

const SERVICE_ICONS: Record<string, any> = {
  Redis: Database,
  vLLM: Cpu,
  Kokoro: Volume2,
  Whisper: Mic,
  Bernard: Server,
  'Bernard-UI': Monitor,
  Server: Globe,
  System: Activity
};

const SERVICE_ORDER = [
  'Bernard',
  'Bernard-UI',
  'Redis',
  'Server',
  'vLLM',
  'Whisper',
  'Kokoro'
];

const STATUS_COLORS = {
  online: 'bg-green-500',
  degraded: 'bg-yellow-500',
  offline: 'bg-red-500'
};

const STATUS_BADGE_VARIANTS = {
  online: 'default' as const,
  degraded: 'secondary' as const,
  offline: 'destructive' as const
};

export function StatusDashboard({ showRestartButtons = false, showLogs = false }: StatusDashboardProps) {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [restartingService, setRestartingService] = useState<string | null>(null);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const { state: authState } = useAuth();
  const isAdmin = authState.user?.isAdmin || false;

  const toast = useToast();

  const fetchStatus = async (includeServices = true, includeLogs = true) => {
    try {
      const params = new URLSearchParams();
      if (includeServices && isAdmin) params.set('services', 'true');
      if (includeLogs && isAdmin) params.set('logs', 'true');

      const query = params.toString();
      const url = `/api/status${query ? `?${query}` : ''}`;

      const response = await fetch(url);
      if (!response.ok) {
        if (response.status === 401) {
          // If we get a 401, try fetching without services/logs
          const basicResponse = await fetch('/api/status');
          if (basicResponse.ok) {
            const data = await basicResponse.json();
            setStatus(data);
            return;
          }
        }
        throw new Error('Failed to fetch status');
      }

      const data = await response.json();
      setStatus(data);
    } catch (error) {
      console.error('Failed to fetch status:', error);
      // Don't show toast for polling failures to avoid spam
    } finally {
      setLoading(false);
    }
  };

  const restartService = async (serviceName: string) => {
    if (!isAdmin) return;
    setRestartingService(serviceName);
    try {
      const response = await fetch('/api/admin/services/restart', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ service: serviceName.toLowerCase() }),
      });

      if (!response.ok) {
        throw new Error('Failed to restart service');
      }

      toast.success(`Restart initiated for ${serviceName}`);
      fetchStatus(true, true);
    } catch (error) {
      console.error('Failed to restart service:', error);
      toast.error(`Failed to restart ${serviceName}`);
    } finally {
      setRestartingService(null);
    }
  };

  const toggleLogs = (serviceName: string) => {
    const newExpanded = new Set(expandedLogs);
    if (newExpanded.has(serviceName)) {
      newExpanded.delete(serviceName);
    } else {
      newExpanded.add(serviceName);
    }
    setExpandedLogs(newExpanded);
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(() => {
      fetchStatus(true, true);
    }, 3000);
    return () => clearInterval(interval);
  }, [isAdmin]);

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'degraded':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'offline':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <XCircle className="w-5 h-5 text-gray-400" />;
    }
  };

  if (loading && !status) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const sortedServices = status?.services?.sort((a, b) => {
    const indexA = SERVICE_ORDER.indexOf(a.name);
    const indexB = SERVICE_ORDER.indexOf(b.name);
    if (indexA === -1 && indexB === -1) return a.name.localeCompare(b.name);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">System Status</h1>
        <p className="text-gray-600 dark:text-gray-300">Live monitor of Bernard microservices</p>
      </div>

      <div className="flex flex-col gap-2">
        {/* System Overview Row */}
        {status && (
          <div className="flex flex-col border rounded-lg bg-card text-card-foreground shadow-sm overflow-hidden">
            <div className="flex items-center p-4 gap-4">
              <div className="flex-shrink-0">
                <Activity className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-grow min-w-0">
                <h3 className="text-sm font-semibold truncate">System Overview</h3>
                <p className="text-xs text-muted-foreground truncate">
                  Uptime: {formatUptime(status.uptimeSeconds)} • {status.activeConversations} active conversations • v{status.version || 'unknown'}
                </p>
              </div>
              <div className="hidden sm:block text-sm text-muted-foreground font-mono w-24 text-right">
                -
              </div>
              <div className="flex items-center gap-2 w-28 justify-end mr-2">
                <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[status.status]}`} />
                <span className="text-xs font-medium capitalize">{status.status}</span>
              </div>
              <div className="w-8 flex-shrink-0" /> {/* Spacer for the 3-dots menu alignment */}
            </div>
          </div>
        )}

        {/* Service Rows */}
        {sortedServices?.map((service) => {
          const Icon = SERVICE_ICONS[service.name] || Server;
          const isExpanded = expandedLogs.has(service.name);

          return (
            <div key={service.name} className="flex flex-col border rounded-lg bg-card text-card-foreground shadow-sm overflow-hidden">
              <div className="flex items-center p-4 gap-4">
                <div className="flex-shrink-0">
                  <Icon className="w-6 h-6 text-muted-foreground" />
                </div>
                <div className="flex-grow min-w-0">
                  <h3 className="text-sm font-semibold truncate">{service.name}</h3>
                  <p className="text-xs text-muted-foreground truncate">{service.description}</p>
                </div>
                <div className="hidden sm:block text-sm text-muted-foreground font-mono w-24 text-right">
                  :{service.port}
                </div>
                <div className="flex items-center gap-2 w-28 justify-end mr-2">
                  <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[service.status]}`} />
                  <span className="text-xs font-medium capitalize">{service.status}</span>
                </div>
                
                <div className="w-8 flex-shrink-0">
                  {isAdmin && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem 
                          onClick={() => restartService(service.name)}
                          disabled={restartingService === service.name}
                        >
                          <Play className="mr-2 h-4 w-4" />
                          Restart Service
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleLogs(service.name)}>
                          {isExpanded ? (
                            <>
                              <EyeOff className="mr-2 h-4 w-4" />
                              Hide Logs
                            </>
                          ) : (
                            <>
                              <Eye className="mr-2 h-4 w-4" />
                              Show Logs
                            </>
                          )}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>

              {service.error && !isExpanded && (
                <div className="px-4 pb-4">
                  <Alert variant="destructive" className="py-2">
                    <AlertTriangle className="h-3 w-3" />
                    <AlertDescription className="text-xs">
                      {service.error}
                    </AlertDescription>
                  </Alert>
                </div>
              )}

              {isExpanded && service.logs && (
                <div className="px-4 pb-4 w-full">
                  <div className="bg-slate-950 text-slate-50 rounded-md p-4 font-mono text-xs overflow-x-auto whitespace-pre border border-slate-800">
                    {service.logs.length > 0 ? service.logs.join('\n') : 'No logs available'}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {(!status?.services || status.services.length === 0) && isAdmin && (
          <Card>
            <CardContent className="py-8">
              <div className="text-center text-muted-foreground">
                <Server className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No services detected. Please check if the backend is running correctly.</p>
              </div>
            </CardContent>
          </Card>
        )}
        
        {!isAdmin && (
          <div className="p-4 text-center text-sm text-muted-foreground italic">
            Service details and actions are only available to administrators.
          </div>
        )}
      </div>
    </div>
  );
}
