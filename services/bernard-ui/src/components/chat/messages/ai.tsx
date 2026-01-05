import type { Message } from '@langchain/langgraph-sdk';
import { getContentString } from '../utils';
import { MarkdownText } from '../markdown-text';
import { cn } from '../../../lib/utils';
import { TooltipIconButton } from '../TooltipIconButton';
import { RefreshCcw, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ToolCalls, ToolResult } from './tool-calls';

function ContentCopyable({ content, disabled }: { content: string; disabled: boolean }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <TooltipIconButton onClick={handleCopy} tooltip={copied ? "Copied" : "Copy"} variant="ghost" disabled={disabled}>
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

export function AssistantMessage({ message, onRegenerate }: { message: Message; onRegenerate?: () => void }) {
  const contentString = getContentString(message.content);

  const handleRegenerate = () => {
    onRegenerate?.();
  };

  const isToolResult = message.type === 'tool';
  const hasToolCalls = message && 'tool_calls' in message && message.tool_calls && message.tool_calls.length > 0;
  const toolCallsHaveContents = hasToolCalls && message.tool_calls?.some((tc) => tc.args && Object.keys(tc.args).length > 0);

  if (isToolResult) {
    return (
      <div className="flex items-start mr-auto gap-2 group">
        <ToolResult message={message} />
      </div>
    );
  }

  return (
    <div className="flex items-start mr-auto gap-2 group">
      <div className="flex flex-col gap-2">
        {contentString.length > 0 && (
          <div className="py-1">
            <MarkdownText>{contentString}</MarkdownText>
          </div>
        )}

        {hasToolCalls && toolCallsHaveContents && (
          <ToolCalls toolCalls={message.tool_calls} />
        )}

        <div className={cn(
          "flex gap-2 items-center mr-auto transition-opacity",
          "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
        )}>
          <ContentCopyable content={contentString} disabled={false} />
          <TooltipIconButton onClick={handleRegenerate} tooltip="Regenerate" variant="ghost">
            <RefreshCcw className="w-4 h-4" />
          </TooltipIconButton>
        </div>
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
