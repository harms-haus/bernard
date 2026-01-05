import { Button } from '../ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import { cn } from '../../lib/utils';

interface TooltipIconButtonProps {
  children: React.ReactNode;
  tooltip: string;
  variant?: 'ghost' | 'secondary' | 'default';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
}

export function TooltipIconButton({
  children,
  tooltip,
  variant = 'ghost',
  size = 'icon',
  onClick,
  disabled,
  className,
  side,
}: TooltipIconButtonProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={variant}
            size={size}
            onClick={onClick}
            disabled={disabled}
            className={cn("h-8 w-8", className)}
          >
            {children}
          </Button>
        </TooltipTrigger>
        <TooltipContent side={side}>
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
