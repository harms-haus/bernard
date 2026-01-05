import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function BranchSwitcher({
  branch,
  branchOptions,
  onSelect,
  isLoading,
}: {
  branch: string | undefined;
  branchOptions: string[] | undefined;
  onSelect: (branch: string) => void;
  isLoading: boolean;
}) {
  if (!branchOptions || !branch || branchOptions.length <= 1) return null;
  const index = branchOptions.indexOf(branch);

  return (
    <div className="flex items-center justify-center w-full mt-2 mb-1 group">
      <div className="flex items-center justify-center w-full gap-6">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-blue-900/30 to-blue-900/30 dark:via-blue-200/20 dark:to-blue-200/20 transition-all duration-300" />

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="size-7 p-1 transition-colors duration-300"
            onClick={() => {
              const prevBranch = branchOptions[index - 1];
              if (!prevBranch) return;
              onSelect(prevBranch);
            }}
            disabled={isLoading || index === 0}
          >
            <ChevronLeft className="h-4 w-4 text-blue-900/60 dark:text-blue-200/60 group-hover:text-foreground transition-colors duration-300" />
          </Button>

          <span className="text-sm min-w-[3.5rem] text-center text-blue-900/60 dark:text-blue-200/60 group-hover:text-foreground transition-colors duration-300 font-medium">
            {index + 1} / {branchOptions.length}
          </span>

          <Button
            variant="ghost"
            size="icon"
            className="size-7 p-1 transition-colors duration-300"
            onClick={() => {
              const nextBranch = branchOptions[index + 1];
              if (!nextBranch) return;
              onSelect(nextBranch);
            }}
            disabled={isLoading || index === branchOptions.length - 1}
          >
          <ChevronRight className="h-4 w-4 text-blue-900/60 dark:text-blue-200/60 group-hover:text-foreground transition-colors duration-300" />
          </Button>
        </div>

        <div className="h-px flex-1 bg-gradient-to-r from-blue-900/30 via-blue-900/30 to-transparent dark:from-blue-200/20 dark:via-blue-200/20 dark:to-transparent transition-all duration-300" />
      </div>
    </div>
  );
}
