import { useState } from 'react';
import type { Message } from '@langchain/langgraph-sdk';
import { Textarea } from '../../ui/textarea';
import { getContentString } from '../utils';
import { cn } from '../../../lib/utils';
import { TooltipIconButton } from '../TooltipIconButton';
import { Pencil, X, Send } from 'lucide-react';

export function HumanMessage({ message }: { message: Message }) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState('');
  const contentString = getContentString(message.content);

  // Placeholder - will be connected to StreamProvider in Phase 4
  const handleSubmitEdit = () => {
    setIsEditing(false);
    // TODO: Submit edited message
  };

  return (
    <div className={cn("flex items-center ml-auto gap-2 group", isEditing && "w-full max-w-xl")}>
      <div className={cn("flex flex-col gap-2", isEditing && "w-full")}>
        {isEditing ? (
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                handleSubmitEdit();
              }
            }}
            className="focus-visible:ring-0 min-h-[44px] resize-none"
          />
        ) : (
          <p className="px-4 py-2 rounded-3xl bg-muted w-fit ml-auto whitespace-pre-wrap">
            {contentString}
          </p>
        )}
        
        <div className={cn(
          "flex gap-2 items-center ml-auto transition-opacity",
          "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100",
          isEditing && "opacity-100"
        )}>
          {isEditing ? (
            <>
              <TooltipIconButton onClick={() => setIsEditing(false)} tooltip="Cancel" variant="ghost">
                <X className="w-4 h-4" />
              </TooltipIconButton>
              <TooltipIconButton onClick={handleSubmitEdit} tooltip="Submit" variant="secondary">
                <Send className="w-4 h-4" />
              </TooltipIconButton>
            </>
          ) : (
            <TooltipIconButton onClick={() => { setValue(contentString); setIsEditing(true); }} tooltip="Edit" variant="ghost">
              <Pencil className="w-4 h-4" />
            </TooltipIconButton>
          )}
        </div>
      </div>
    </div>
  );
}
