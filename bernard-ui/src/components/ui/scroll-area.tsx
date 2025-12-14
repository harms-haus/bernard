import * as React from 'react';

interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {}

const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`relative overflow-hidden ${className || ''}`}
        {...props}
      >
        <div className="h-full w-full overflow-auto">{children}</div>
      </div>
    );
  }
);

ScrollArea.displayName = 'ScrollArea';

export { ScrollArea };