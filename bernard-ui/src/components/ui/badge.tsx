import * as React from 'react';

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline';
}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant = 'default', ...props }, ref) => {
    const variantClasses = {
      default: 'bg-primary text-primary-foreground hover:bg-primary/80 dark:bg-primary/90 dark:text-primary-foreground',
      secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80 dark:bg-secondary/80 dark:text-secondary-foreground',
      destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/80 dark:bg-destructive/90 dark:text-destructive-foreground',
      outline: 'text-foreground border border-input hover:bg-accent hover:text-accent-foreground dark:text-foreground/90 dark:border-input/70 dark:hover:bg-accent/80 dark:hover:text-accent-foreground'
    };

    return (
      <div
        ref={ref}
        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${variantClasses[variant]} ${className || ''}`}
        {...props}
      />
    );
  }
);

Badge.displayName = 'Badge';

export { Badge };