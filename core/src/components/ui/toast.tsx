import * as React from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
// Utility function for conditional classNames
const cn = (...classes: (string | boolean | undefined | null)[]) => {
  return classes.filter(Boolean).join(' ');
};

const ToastProvider = ToastPrimitive.Provider;

interface ToastViewportProps extends React.ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport> {
  className?: string;
}

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Viewport>,
  ToastViewportProps
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Viewport
    ref={ref}
    className={cn(
      'fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]',
      className
    )}
    {...props}
  />
));

ToastViewport.displayName = ToastPrimitive.Viewport.displayName;

export type ToastVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

interface ToastIconProps {
  variant: ToastVariant;
  className?: string;
}

const ToastIcon: React.FC<ToastIconProps> = ({ variant, className }) => {
  const iconProps = {
    className: `h-5 w-5 ${className || ''}`,
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

interface ToastProps extends React.ComponentPropsWithoutRef<typeof ToastPrimitive.Root> {
  variant?: ToastVariant;
  title?: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  duration?: number;
}

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Root>,
  ToastProps
>(({ className, variant = 'default', title, description, action, duration = 5000, ...props }, ref) => {
  return (
    <ToastPrimitive.Root
      ref={ref}
      className={cn(
        'group pointer-events-auto relative flex w-full items-center space-x-4 overflow-hidden rounded-md border bg-background px-5 py-2 pr-8 shadow-lg animate-in slide-in-from-bottom-full sm:animate-in sm:slide-in-from-right-full',
        variant === 'error' && 'border-destructive/50 bg-destructive/10 text-destructive-foreground',
        variant === 'success' && 'border-green-500 bg-green-400/10 text-green-500',
        variant === 'warning' && 'border-yellow-500/50 bg-yellow-500/10 text-yellow-500',
        variant === 'info' && 'border-blue-500/50 bg-blue-500/10 text-blue-500',
        className
      )}
      duration={duration}
      {...props}
    >
      <ToastIcon variant={variant} />
      <div className="flex-1">
        {title && (
          <ToastPrimitive.Title className="text-sm font-semibold">
            {title}
          </ToastPrimitive.Title>
        )}
        {description && (
          <ToastPrimitive.Description className="text-sm text-muted-foreground">
            {description}
          </ToastPrimitive.Description>
        )}
      </div>
      {action && (
        <div className="flex items-center gap-2">
          {action}
        </div>
      )}
      <ToastPrimitive.Close
        className="absolute right-1 top-1 rounded-md p-1 text-muted-foreground/70 opacity-0 transition-opacity hover:bg-secondary hover:text-muted-foreground focus:opacity-100 focus:outline-none focus:ring-2 group-hover:opacity-100 group-hover:text-muted-foreground"
        aria-label="Close"
      >
        <X className="h-4 w-4" />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  );
});

Toast.displayName = ToastPrimitive.Root.displayName;

interface ToastActionProps extends React.ComponentPropsWithoutRef<typeof ToastPrimitive.Action> {
  className?: string;
}

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Action>,
  ToastActionProps
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Action
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ring-offset-background bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2',
      className
    )}
    {...props}
  />
));

ToastAction.displayName = ToastPrimitive.Action.displayName;

interface ToastTitleProps extends React.ComponentPropsWithoutRef<typeof ToastPrimitive.Title> {
  className?: string;
}

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Title>,
  ToastTitleProps
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Title
    ref={ref}
    className={cn('text-sm font-semibold', className)}
    {...props}
  />
));

ToastTitle.displayName = ToastPrimitive.Title.displayName;

interface ToastDescriptionProps extends React.ComponentPropsWithoutRef<typeof ToastPrimitive.Description> {
  className?: string;
}

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Description>,
  ToastDescriptionProps
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));

ToastDescription.displayName = ToastPrimitive.Description.displayName;

export { ToastProvider, ToastViewport, Toast, ToastAction, ToastTitle, ToastDescription };