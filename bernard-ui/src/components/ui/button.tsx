import * as React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background';
    
    const variantClasses = {
      default: 'bg-primary text-primary-foreground hover:bg-primary/90 dark:bg-primary/90 dark:text-primary-foreground dark:hover:bg-primary/80',
      destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90 dark:bg-destructive/90 dark:text-destructive-foreground dark:hover:bg-destructive/80',
      outline: 'border border-input hover:bg-accent hover:text-accent-foreground dark:border-input/70 dark:hover:bg-accent/80 dark:hover:text-accent-foreground',
      secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80 dark:bg-secondary/80 dark:text-secondary-foreground dark:hover:bg-secondary/70',
      ghost: 'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/80 dark:hover:text-accent-foreground',
      link: 'underline-offset-4 hover:underline text-primary dark:text-primary/90'
    };

    const sizeClasses = {
      default: 'h-10 px-4 py-2',
      sm: 'h-9 px-3 rounded-md',
      lg: 'h-11 px-8 rounded-md',
      icon: 'h-10 w-10'
    };

    return (
      <button
        className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className || ''}`}
        ref={ref}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';

export { Button };