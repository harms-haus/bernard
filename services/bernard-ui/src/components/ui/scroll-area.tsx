import * as React from 'react';

interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {}

const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ className, children, ...props }, ref) => {
    const innerRef = React.useRef<HTMLDivElement>(null);

    // Forward the ref to the inner scrollable div instead of the outer container
    React.useImperativeHandle(ref, () => innerRef.current!, []);

    return (
      <div
        className={`relative overflow-hidden ${className || ''}`}
        {...props}
      >
        <div
          ref={innerRef}
          className="h-full w-full overflow-auto scrollbar-thin"
        >
          {children}
        </div>
      </div>
    );
  }
);

ScrollArea.displayName = 'ScrollArea';

export { ScrollArea };