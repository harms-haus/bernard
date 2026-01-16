import * as React from 'react';
import { Play, CheckCircle, XCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from './button';
import { Popover, PopoverTrigger, PopoverContent } from './popover';

export type ServiceTestStatus = 'idle' | 'loading' | 'success' | 'failed' | 'unauthorized' | 'connection_error' | 'server_error' | 'configuration_error';

interface ServiceTestButtonProps {
  serviceName: string;
  status: ServiceTestStatus;
  errorMessage?: string;
  errorType?: string;
  onTest: () => Promise<void>;
  isConfigured: boolean;
  className?: string;
}

const getStatusIcon = (status: ServiceTestStatus) => {
  switch (status) {
    case 'loading':
      return <Loader2 className="h-4 w-4 animate-spin" />;
    case 'success':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'failed':
    case 'unauthorized':
    case 'connection_error':
    case 'server_error':
    case 'configuration_error':
      return <XCircle className="h-4 w-4 text-red-500" />;
    default:
      return null;
  }
};

const getStatusColor = (status: ServiceTestStatus): string => {
  switch (status) {
    case 'loading':
      return 'bg-yellow-500';
    case 'success':
      return 'bg-green-500';
    case 'failed':
    case 'unauthorized':
    case 'connection_error':
    case 'server_error':
    case 'configuration_error':
      return 'bg-red-500';
    default:
      return 'bg-gray-400';
  }
};

const getErrorTooltip = (status: ServiceTestStatus, errorMessage?: string): string => {
  if (status === 'idle' || status === 'loading' || status === 'success') {
    return '';
  }

  const baseMessage = errorMessage || 'Unknown error';

  switch (status) {
    case 'unauthorized':
      return `Authentication failed: ${baseMessage}`;
    case 'connection_error':
      return `Cannot connect to service: ${baseMessage}`;
    case 'server_error':
      return `Server error: ${baseMessage}`;
    case 'configuration_error':
      return `Configuration error: ${baseMessage}`;
    case 'failed':
    default:
      return `Test failed: ${baseMessage}`;
  }
};

export function ServiceTestButton({
  status,
  errorMessage,
  onTest,
  isConfigured,
  className = ''
}: ServiceTestButtonProps) {
  const [popoverOpen, setPopoverOpen] = React.useState(false);
  const tooltipText = getErrorTooltip(status, errorMessage);

  const handleTest = async () => {
    setPopoverOpen(false);
    await onTest();
  };

  React.useEffect(() => {
    if (status === 'failed' || status === 'unauthorized' || status === 'connection_error' || status === 'server_error' || status === 'configuration_error') {
      setPopoverOpen(true);
    }
  }, [status]);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <div className="flex items-center gap-2 cursor-pointer">
            {/* Status indicator dot */}
            <div
              className={`relative flex items-center justify-center w-6 h-6 rounded-full ${getStatusColor(status)} transition-colors duration-200`}
            >
              {getStatusIcon(status)}
            </div>
          </div>
        </PopoverTrigger>

        {tooltipText && (
          <PopoverContent
            side="bottom"
            align="start"
            className="max-w-xs bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800"
            sideOffset={5}
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <span className="font-semibold text-red-700 dark:text-red-300 text-sm">
                  Connection Failed
                </span>
              </div>
              <p className="text-xs text-red-600 dark:text-red-400 leading-relaxed">
                {tooltipText}
              </p>
            </div>
          </PopoverContent>
        )}
      </Popover>

      <Button
        variant="outline"
        size="sm"
        onClick={handleTest}
        disabled={status === 'loading' || !isConfigured}
        className="flex items-center gap-1.5"
      >
        <Play className="h-3.5 w-3.5" />
        Test
      </Button>
    </div>
  );
}
