import type { Message, ToolMessage, Checkpoint } from '@langchain/langgraph-sdk';
import { getContentString } from '../utils';
import { MarkdownText } from '../markdown-text';
import { TooltipIconButton } from '../TooltipIconButton';
import { RefreshCcw, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ToolCalls } from './tool-calls';
import { cn } from '@/lib/utils';
import { BranchSwitcher } from '../BranchSwitcher';
import { useStreamContext } from '../../../providers/StreamProvider';

function ContentCopyable({ content, disabled, side = 'top' }: { content: string; disabled: boolean; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <TooltipIconButton onClick={handleCopy} tooltip={copied ? "Copied" : "Copy"} variant="ghost" disabled={disabled} side={side}>
      <AnimatePresence mode="wait" initial={false}>
        {copied ? (
          <motion.div key="check" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
            <Check className="w-4 h-4 text-green-500" />
          </motion.div>
        ) : (
          <motion.div key="copy" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
            <Copy className="w-4 h-4" />
          </motion.div>
        )}
      </AnimatePresence>
    </TooltipIconButton>
  );
}

export function AssistantMessage({
  message,
  onRegenerate,
  nextMessages = [],
  isLoading = false,
}: {
  message: Message;
  onRegenerate?: (parentCheckpoint: Checkpoint | null | undefined) => void;
  nextMessages?: Message[];
  isLoading?: boolean;
}) {
  const thread = useStreamContext();
  const contentString = getContentString(message.content);

  const meta = message ? thread.getMessagesMetadata(message) : undefined;
  const parentCheckpoint = meta?.firstSeenState?.parent_checkpoint;
  const hasBranches = meta?.branchOptions && meta.branchOptions.length > 1;

  const handleRegenerate = () => {
    onRegenerate?.(parentCheckpoint);
  };

  const isToolResult = message.type === 'tool';
  const hasToolCalls = message && 'tool_calls' in message && message.tool_calls && message.tool_calls.length > 0;
  const toolCallsHaveContents = hasToolCalls && message.tool_calls?.some((tc) => tc.args && Object.keys(tc.args).length > 0);

  // Look ahead for tool results that match tool calls
  const toolResults = hasToolCalls
    ? (nextMessages.filter((m) => m.type === 'tool' && message.tool_calls?.some((tc) => tc.id === m.tool_call_id)) as ToolMessage[])
    : [];

  if (isToolResult) {
    return (
      <div className="flex items-start mr-auto gap-2 group">
        <ToolCalls toolCalls={[{ id: message.tool_call_id!, name: message.name || 'unknown', args: {} }]} toolResults={[message]} />
      </div>
    );
  }

  return (
    <div className={cn("flex items-start gap-2 group relative", hasToolCalls ? "mb-2" : "mb-6", hasBranches ? "w-full" : "mr-auto")}>
      <div className="absolute -left-12 top-1/2 -translate-y-1/2 flex flex-col gap-2 items-center transition-opacity opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
        <ContentCopyable content={contentString} disabled={false} side="left" />
        <TooltipIconButton onClick={handleRegenerate} tooltip="Regenerate" variant="ghost" side="left">
          <RefreshCcw className="w-4 h-4" />
        </TooltipIconButton>
      </div>
      <div className="flex flex-col gap-0 w-full">
        <BranchSwitcher
          branch={meta?.branch}
          branchOptions={meta?.branchOptions}
          onSelect={(branch) => thread.setBranch(branch)}
          isLoading={isLoading}
        />
        {contentString.length > 0 && (
          <div>
            <MarkdownText>{contentString}</MarkdownText>
          </div>
        )}

        {hasToolCalls && toolCallsHaveContents && (
          <ToolCalls toolCalls={message.tool_calls} toolResults={toolResults} />
        )}
      </div>
    </div>
  );
}

export function AssistantMessageLoading() {
  return (
    <div className="flex items-start mr-auto gap-2">
      <div className="flex items-center gap-1 rounded-2xl bg-muted px-4 py-2 h-8">
        <div className="w-1.5 h-1.5 rounded-full bg-foreground/50 animate-[pulse_1.5s_ease-in-out_infinite]"></div>
        <div className="w-1.5 h-1.5 rounded-full bg-foreground/50 animate-[pulse_1.5s_ease-in-out_0.5s_infinite]"></div>
        <div className="w-1.5 h-1.5 rounded-full bg-foreground/50 animate-[pulse_1.5s_ease-in-out_1s_infinite]"></div>
      </div>
    </div>
  );
}
