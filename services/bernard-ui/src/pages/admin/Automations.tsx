import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Loader2 } from 'lucide-react';
import { adminApiClient, AutomationInfo } from '../../services/adminApi';
import { useToast } from '../../components/ToastManager';

export default function Automations() {
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [automations, setAutomations] = useState<AutomationInfo[]>([]);
  const toast = useToast();

  const loadAutomations = async () => {
    setLoading(true);
    try {
      const response = await adminApiClient.getAutomations();
      setAutomations(response.automations);
    } catch (error) {
      toast.error('Failed to load automations', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const toggleAutomation = async (automation: AutomationInfo) => {
    setUpdating(automation.id);
    try {
      await adminApiClient.updateAutomation(automation.id, !automation.enabled);
      setAutomations(prev =>
        prev.map(a =>
          a.id === automation.id
            ? { ...a, enabled: !a.enabled }
            : a
        )
      );
      toast.success(
        'Automation updated',
        `${automation.name} is now ${!automation.enabled ? 'enabled' : 'disabled'}`
      );
    } catch (error) {
      toast.error('Failed to update automation', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setUpdating(null);
    }
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatTimestamp = (timestamp?: number) => {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleString();
  };

  useEffect(() => {
    loadAutomations();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Automations</h1>
        <p className="text-muted-foreground">
          Manage automated tasks that run when specific events occur in conversations.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Automation Rules</CardTitle>
          <CardDescription>
            Configure which automations are enabled and view their execution history.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="ml-2">Loading automations...</span>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name & Description</TableHead>
                  <TableHead>Triggers</TableHead>
                  <TableHead>Last Run</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Runs</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {automations.map((automation) => (
                  <TableRow key={automation.id}>
                    <TableCell className="max-w-md">
                      <div className="space-y-1">
                        <div className="font-medium">{automation.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {automation.description}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {automation.hooks.map((hook) => (
                          <Badge key={hook} variant="secondary" className="text-xs w-fit">
                            {hook.replace('_', ' ')}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatTimestamp(automation.lastRunTime)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDuration(automation.lastRunDuration)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {automation.runCount.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <label className="inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={automation.enabled}
                          onChange={() => toggleAutomation(automation)}
                          disabled={updating === automation.id}
                          className="sr-only peer"
                        />
                        <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 ${
                          automation.enabled ? 'bg-green-500' : 'bg-gray-200'
                        } ${updating === automation.id ? 'animate-pulse' : ''}`}>
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            automation.enabled ? 'translate-x-6' : 'translate-x-1'
                          }`} />
                        </div>
                      </label>
                    </TableCell>
                  </TableRow>
                ))}
                {automations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No automations found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
