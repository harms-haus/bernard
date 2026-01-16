import { useState } from 'react';
import type { Message } from '@langchain/langgraph-sdk';
import { getContentString } from '../utils';
import { cn } from '../../../lib/utils';
import { TooltipIconButton } from '../TooltipIconButton';
import { Pencil, X, Send } from 'lucide-react';
import { useStreamContext } from '../../../providers/StreamProvider';
import { BranchSwitcher } from '../BranchSwitcher';

interface HumanMessageProps {
  message: Message;
  isLoading?: boolean;
}

export function HumanMessage({ message, isLoading = false }: HumanMessageProps) {
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
    <div className={cn("flex flex-col items-center gap-2 group mb-6 w-full")} data-testid="human-message">
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
              <TooltipIconButton onClick={() => setIsEditing(false)} tooltip="Cancel" variant="ghost" side="right" data-testid="cancel-edit-button">
                <X className="w-4 h-4" />
              </TooltipIconButton>
              <TooltipIconButton onClick={handleSubmitEdit} tooltip="Submit" variant="secondary" side="right" data-testid="submit-edit-button">
                <Send className="w-4 h-4" />
              </TooltipIconButton>
            </>
          ) : (
            <TooltipIconButton onClick={() => { setValue(contentString); setIsEditing(true); }} tooltip="Edit" variant="ghost" side="right" data-testid="edit-message-button">
              <Pencil className="w-4 h-4" />
            </TooltipIconButton>
          )}
        </div>
        <div className={cn("flex flex-1 flex-col gap-2", isEditing && "w-full")}>
          {isEditing ? (
            <textarea
              data-testid="edit-textarea"
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
            <p className="px-4 py-2 rounded-3xl bg-muted w-fit ml-auto whitespace-pre-wrap" data-testid="message-content">
              {contentString}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
