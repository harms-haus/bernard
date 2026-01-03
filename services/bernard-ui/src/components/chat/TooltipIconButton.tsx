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
}

export function TooltipIconButton({
  children,
  tooltip,
  variant = 'ghost',
  size = 'icon',
  onClick,
  disabled,
  className,
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
        <TooltipContent>
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
