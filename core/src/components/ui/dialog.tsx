import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X, AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react';

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { disableClose?: boolean }
>(({ className, children, disableClose, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
    <DialogPrimitive.Content
      ref={ref}
      className={`fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg ${className || ''}`}
      {...props}
    >
      {children}
      {!disableClose && (
        <DialogPrimitive.Close
          aria-label="Close"
          className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <X className="h-4 w-4" />
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));

DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`flex flex-col space-y-2 text-center sm:text-left ${className || ''}`} {...props} />
);

DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 ${className || ''}`} {...props} />
);

DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={`text-lg font-semibold leading-none tracking-tight ${className || ''}`}
    {...props}
  />
));

DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={`text-sm text-muted-foreground ${className || ''}`}
    {...props}
  />
));

DialogDescription.displayName = DialogPrimitive.Description.displayName;

// Dialog variant types
export type DialogVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

interface DialogIconProps {
  variant: DialogVariant;
  className?: string;
}

const DialogIcon: React.FC<DialogIconProps> = ({ variant, className }) => {
  const iconProps = {
    className: `h-6 w-6 ${className || ''}`,
  };

  switch (variant) {
    case 'success':
      return <CheckCircle {...iconProps} className={`text-green-500 ${iconProps.className}`} />;
    case 'warning':
      return <AlertTriangle {...iconProps} className={`text-yellow-500 ${iconProps.className}`} />;
    case 'error':
      return <AlertCircle {...iconProps} className={`text-red-500 ${iconProps.className}`} />;
    case 'info':
      return <Info {...iconProps} className={`text-blue-500 ${iconProps.className}`} />;
    default:
      return null;
  }
};

interface AlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void | Promise<void>;
  variant?: DialogVariant;
  confirmVariant?: 'default' | 'destructive';
  loading?: boolean;
  children?: React.ReactNode;
  timeout?: number; // Timeout in milliseconds for stuck loading states
}

export const AlertDialog: React.FC<AlertDialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  variant = 'default',
  confirmVariant = 'default',
  loading = false,
  children,
  timeout,
}) => {
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [timeRemaining, setTimeRemaining] = React.useState<number | null>(null);

  // Handle timeout for stuck loading states
  React.useEffect(() => {
    if (open && loading && timeout && timeout > 0) {
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Initialize countdown
      setTimeRemaining(timeout);

      // Set new timeout
      timeoutRef.current = setTimeout(() => {
        console.warn('Dialog timeout reached, closing dialog to prevent stuck state');
        onOpenChange(false);
      }, timeout);

      // Start countdown interval
      const countdownInterval = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev && prev > 1000) {
            return prev - 1000;
          }
          return null;
        });
      }, 1000);

      // Cleanup timeout and interval on unmount or when conditions change
      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        clearInterval(countdownInterval);
        setTimeRemaining(null);
      };
    } else {
      // Cleanup if conditions are not met
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setTimeRemaining(null);
    }
  }, [open, loading, timeout, onOpenChange]);

  const handleConfirm = async () => {
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (error) {
      console.error('Dialog action failed:', error);
      throw error; // Re-throw so parent can handle
    }
  };

  return (
    <Dialog open={open} onOpenChange={loading ? undefined : onOpenChange}>
      <DialogContent disableClose={loading}>
        <DialogHeader>
          <div className="flex items-center justify-center w-full">
            <DialogIcon variant={variant} />
          </div>
          <DialogTitle className="text-center sm:text-left">{title}</DialogTitle>
          {description && (
            <DialogDescription className="text-center sm:text-left">{description}</DialogDescription>
          )}
          {children}
        </DialogHeader>
        <DialogFooter>
          <DialogPrimitive.Close asChild>
            <button
              className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background bg-secondary text-secondary-foreground hover:bg-secondary/80 dark:bg-secondary/80 dark:text-secondary-foreground dark:hover:bg-secondary/70 h-10 px-4 py-2"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              {cancelText}
            </button>
          </DialogPrimitive.Close>
          <button
            className={`inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background ${confirmVariant === 'destructive'
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90 dark:bg-destructive/90 dark:text-destructive-foreground dark:hover:bg-destructive/80'
                : 'bg-primary text-primary-foreground hover:bg-primary/90 dark:bg-primary/90 dark:text-primary-foreground dark:hover:bg-primary/80'
              } h-10 px-4 py-2`}
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? 'Loading...' : confirmText}
          </button>
          {loading && timeRemaining && (
            <div className="text-sm text-muted-foreground ml-2">
              Auto-closing in {Math.ceil(timeRemaining / 1000)}s...
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription };