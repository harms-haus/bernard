import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import {
  RefreshCw,
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
  Globe
} from 'lucide-react';
import { useToast } from './ToastManager';

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
  Server: Globe
};

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
  const [refreshing, setRefreshing] = useState(false);
  const [restartingService, setRestartingService] = useState<string | null>(null);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

  const toast = useToast();

  const fetchStatus = async (includeServices = true, includeLogs = showLogs) => {
    try {
      const params = new URLSearchParams();
      if (includeServices) params.set('services', 'true');
      if (includeLogs) params.set('logs', 'true');

      const query = params.toString();
      const url = `/bernard/api/status${query ? `?${query}` : ''}`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch status');
      }

      const data = await response.json();
      setStatus(data);
    } catch (error) {
      console.error('Failed to fetch status:', error);
      toast.error('Failed to fetch system status');
    }
  };

  const restartService = async (serviceName: string) => {
    setRestartingService(serviceName);
    try {
      const response = await fetch('/bernard/api/admin/services/restart', {
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

      // Refresh status after a delay to show the restart progress
      setTimeout(() => {
        fetchStatus(true, showLogs);
      }, 2000);

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
    setLoading(false);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchStatus(true, showLogs);
    setRefreshing(false);
  };

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
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'degraded':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'offline':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <XCircle className="w-4 h-4 text-gray-500" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">System Status</h1>
          <p className="text-gray-600 dark:text-gray-300">Monitor Bernard microservices</p>
        </div>
        <Button onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      {/* Overall Status */}
      {status && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {getStatusIcon(status.status)}
              System Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Status</p>
                <Badge variant={STATUS_BADGE_VARIANTS[status.status]}>
                  {status.status}
                </Badge>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Uptime</p>
                <p className="text-lg font-semibold">{formatUptime(status.uptimeSeconds)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Active Conversations</p>
                <p className="text-lg font-semibold">{status.activeConversations}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Version</p>
                <p className="text-lg font-semibold">{status.version || 'Unknown'}</p>
              </div>
            </div>
            {status.notes && (
              <div className="mt-4">
                <p className="text-sm text-muted-foreground">{status.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Services */}
      {status?.services && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Services</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {status.services.map((service) => {
              const Icon = SERVICE_ICONS[service.name] || Server;
              const isExpanded = expandedLogs.has(service.name);

              return (
                <Card key={service.name}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className="w-5 h-5" />
                        <CardTitle className="text-lg">{service.name}</CardTitle>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[service.status]}`} />
                        <Badge variant={STATUS_BADGE_VARIANTS[service.status]} className="text-xs">
                          {service.status}
                        </Badge>
                      </div>
                    </div>
                    <CardDescription>{service.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-sm text-muted-foreground">
                      Port: {service.port}
                    </div>

                    {service.error && (
                      <Alert>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription className="text-sm">
                          {service.error}
                        </AlertDescription>
                      </Alert>
                    )}

                    <div className="flex gap-2">
                      {showRestartButtons && service.status !== 'online' && (
                        <Button
                          size="sm"
                          onClick={() => restartService(service.name)}
                          disabled={restartingService === service.name}
                        >
                          <Play className="w-3 h-3 mr-1" />
                          {restartingService === service.name ? 'Restarting...' : 'Restart'}
                        </Button>
                      )}

                      {showLogs && service.logs && service.logs.length > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => toggleLogs(service.name)}
                        >
                          {isExpanded ? (
                            <>
                              <EyeOff className="w-3 h-3 mr-1" />
                              Hide Logs
                            </>
                          ) : (
                            <>
                              <Eye className="w-3 h-3 mr-1" />
                              Show Logs
                            </>
                          )}
                        </Button>
                      )}
                    </div>

                    {isExpanded && service.logs && (
                      <div className="mt-3">
                        <div className="bg-gray-50 dark:bg-gray-900 rounded p-3 max-h-40 overflow-y-auto">
                          <pre className="text-xs whitespace-pre-wrap font-mono">
                            {service.logs.join('\n')}
                          </pre>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {!status?.services && (
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-muted-foreground">
              <Server className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Service details not available. Please refresh or check admin permissions.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
