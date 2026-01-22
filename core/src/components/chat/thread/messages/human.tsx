import { useState } from 'react';
import type { Message } from '@langchain/langgraph-sdk';
import { getContentString } from '../utils';
import { cn } from '@/lib/utils';
import { TooltipIconButton } from '@/components/chat/TooltipIconButton';
import { Pencil, X, Send, RefreshCw } from 'lucide-react';
import { useStreamContext } from '../providers/Stream';
import { BranchSwitcher } from '../components/BranchSwitcher';

interface HumanMessageProps {
  message: Message;
}

export function HumanMessage({ message }: HumanMessageProps) {
  const thread = useStreamContext();

  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState('');
  const contentString = getContentString(message.content);

  // Use SDK's getMessagesMetadata - should now work with checkpoint injection
  const messageMetadata = thread.getMessagesMetadata?.(message);
  const branch = messageMetadata?.branch;
  const branchOptions = messageMetadata?.branchOptions;
  // The checkpoint for retry is the parent checkpoint from firstSeenState
  const parentCheckpoint = messageMetadata?.firstSeenState?.parent_checkpoint;

  const handleRetry = () => {
    // Check if we even have checkpoint data
    if (!parentCheckpoint?.checkpoint_id) {
      console.warn('[Retry] No parent checkpoint found - branching will not work');
      // Fallback: submit normally (this will append, not branch)
      thread.submit(
        { messages: [message] },
        {}
      );
      return;
    }

    // Re-submit the same message from the parent checkpoint to create a new branch
    thread.submit(
      { messages: [message] },
      { checkpoint: parentCheckpoint } as any
    );
  };

  const handleBranchSelect = (selectedBranch: string) => {
    thread.setBranch(selectedBranch);
  };

  const handleSubmitEdit = () => {
    if (value.trim() && value.trim() !== contentString) {
      setIsEditing(false);

      const newMessage: Message = {
        ...message,
        type: "human",
        content: value.trim()
      };
      thread.submit(
        { messages: [newMessage] },
        {
          optimisticValues: (prev) => {
            const prevMessages = prev.messages ?? [];
            // Replace the existing message by id instead of appending
            const messageIndex = prevMessages.findIndex(m => m.id === message.id);
            if (messageIndex >= 0) {
              const updatedMessages = [...prevMessages];
              updatedMessages[messageIndex] = newMessage;
              return {
                ...prev,
                messages: updatedMessages,
              };
            }
            // Fallback: if message not found, append (shouldn't happen)
            return {
              ...prev,
              messages: [...prevMessages, newMessage],
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
      <div className={cn("flex items-center ml-auto gap-2 relative w-full max-w-xl", isEditing && "w-full max-w-xl")}>
        <div className={cn("absolute -right-20 top-1/2 -translate-y-1/2 flex flex-row gap-1 items-center transition-opacity opacity-0 group-focus-within:opacity-100 group-hover:opacity-100", isEditing && "opacity-100")}>
          {isEditing ? (
            <>
              <TooltipIconButton onClick={() => setIsEditing(false)} tooltip="Cancel" variant="ghost" side="bottom" data-testid="cancel-edit-button">
                <X className="w-4 h-4" />
              </TooltipIconButton>
              <TooltipIconButton onClick={handleSubmitEdit} tooltip="Submit" variant="secondary" side="bottom" data-testid="submit-edit-button">
                <Send className="w-4 h-4" />
              </TooltipIconButton>
            </>
          ) : (
            <>
              <TooltipIconButton onClick={() => { setValue(contentString); setIsEditing(true); }} tooltip="Edit" variant="ghost" side="bottom" data-testid="edit-message-button">
                <Pencil className="w-4 h-4" />
              </TooltipIconButton>
              <TooltipIconButton onClick={handleRetry} tooltip="Retry" variant="ghost" side="bottom" data-testid="retry-message-button" disabled={thread.isLoading}>
                <RefreshCw className="w-4 h-4" />
              </TooltipIconButton>
            </>
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

      {/* BranchSwitcher appears after the user message */}
      <BranchSwitcher
        branch={branch}
        branchOptions={branchOptions}
        onSelect={handleBranchSelect}
        isLoading={thread.isLoading}
      />
    </div>
  );
}
