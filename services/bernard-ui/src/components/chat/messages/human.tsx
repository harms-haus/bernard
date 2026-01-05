import { useState } from 'react';
import type { Message } from '@langchain/langgraph-sdk';
import { getContentString } from '../utils';
import { cn } from '../../../lib/utils';
import { TooltipIconButton } from '../TooltipIconButton';
import { Pencil, X, Send, ChevronLeft, ChevronRight } from 'lucide-react';
import { useStreamContext } from '../../../providers/StreamProvider';
import { Button } from '../../ui/button';

function BranchSwitcher({
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

export function HumanMessage({
  message,
  isLoading = false,
}: {
  message: Message;
  isLoading?: boolean;
}) {
  const thread = useStreamContext();
  const meta = thread.getMessagesMetadata(message);
  const parentCheckpoint = meta?.firstSeenState?.parent_checkpoint;
  const hasBranches = meta?.branchOptions && meta.branchOptions.length > 1;

  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState('');
  const contentString = getContentString(message.content);

  const handleSubmitEdit = () => {
    if (value.trim() && value.trim() !== contentString) {
      setIsEditing(false);

      const newMessage: Message = { type: "human", content: value.trim() };
      thread.submit(
        { messages: [newMessage] },
        {
          checkpoint: parentCheckpoint,
          streamMode: ["values"],
          optimisticValues: (prev) => {
            const values = meta?.firstSeenState?.values;
            if (!values) return prev;

            return {
              ...values,
              messages: [...(values.messages ?? []), newMessage],
            };
          },
        }
      );
    } else {
      setIsEditing(false);
    }
  };

  return (
    <div className={cn("flex flex-col items-center gap-2 group mb-6 w-full")}>
      {hasBranches && (
        <BranchSwitcher
          branch={meta?.branch}
          branchOptions={meta?.branchOptions}
          onSelect={(branch) => thread.setBranch(branch)}
          isLoading={isLoading}
        />
      )}
      <div className={cn("flex items-center ml-auto gap-2 relative w-full max-w-xl", isEditing && "w-full max-w-xl")}>
        <div className={cn("absolute -right-12 top-1/2 -translate-y-1/2 flex flex-col gap-2 items-center transition-opacity opacity-0 group-focus-within:opacity-100 group-hover:opacity-100", isEditing && "opacity-100")}>
          {isEditing ? (
            <>
              <TooltipIconButton onClick={() => setIsEditing(false)} tooltip="Cancel" variant="ghost" side="right">
                <X className="w-4 h-4" />
              </TooltipIconButton>
              <TooltipIconButton onClick={handleSubmitEdit} tooltip="Submit" variant="secondary" side="right">
                <Send className="w-4 h-4" />
              </TooltipIconButton>
            </>
          ) : (
            <TooltipIconButton onClick={() => { setValue(contentString); setIsEditing(true); }} tooltip="Edit" variant="ghost" side="right">
              <Pencil className="w-4 h-4" />
            </TooltipIconButton>
          )}
        </div>
        <div className={cn("flex flex-col gap-2", isEditing && "w-full")}>
          {isEditing ? (
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  handleSubmitEdit();
                }
              }}
              className="focus-visible:ring-0 min-h-[44px] resize-none px-3 py-2 rounded-lg border bg-background w-full"
            />
          ) : (
            <p className="px-4 py-2 rounded-3xl bg-muted w-fit ml-auto whitespace-pre-wrap">
              {contentString}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
