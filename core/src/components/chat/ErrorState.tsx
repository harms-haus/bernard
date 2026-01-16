import { Button } from '../ui/button';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({ message, onRetry, className }: ErrorStateProps) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center gap-4 p-8 text-center",
      className
    )}>
      <div className="flex flex-col items-center gap-2">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-destructive font-medium">{message}</p>
      </div>
      {onRetry && (
        <Button onClick={onRetry} variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      )}
    </div>
  );
}

interface MessageErrorStateProps {
  onRetry?: () => void;
}

export function MessageErrorState({ onRetry }: MessageErrorStateProps) {
  return (
    <div className="flex items-start mr-auto gap-2 group">
      <div className="flex flex-col gap-2">
        <ErrorState
          message="Failed to load message"
          onRetry={onRetry}
          className="py-1"
        />
      </div>
    </div>
  );
}
