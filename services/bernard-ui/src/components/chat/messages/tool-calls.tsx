import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Wrench } from 'lucide-react';
import type { AIMessage, ToolMessage } from '@langchain/langgraph-sdk';

function isComplexValue(value: any): boolean {
  return Array.isArray(value) || (typeof value === 'object' && value !== null);
}

function formatArgs(args: Record<string, any>): string {
  const entries = Object.entries(args);
  if (entries.length === 0) return '';
  return entries.map(([, value]) => String(value)).join(', ');
}

function formatResult(message: ToolMessage): { content: string; isJson: boolean } {
  let parsedContent: any;
  let isJsonContent = false;

  try {
    if (typeof message.content === 'string') {
      parsedContent = JSON.parse(message.content);
      isJsonContent = true;
    }
  } catch {
    parsedContent = message.content;
  }

  const contentStr = isJsonContent
    ? JSON.stringify(parsedContent, null, 2)
    : String(message.content);

  return { content: contentStr, isJson: isJsonContent };
}

function ToolResultContent({ message }: { message: ToolMessage }) {
  const { content, isJson } = formatResult(message);

  if (isJson) {
    let parsedContent: any;
    try {
      parsedContent = JSON.parse(message.content as string);
    } catch {
      parsedContent = message.content;
    }

    const entries: [string, any][] = Array.isArray(parsedContent)
      ? parsedContent.map((item: any, idx: number) => [String(idx), item])
      : Object.entries(parsedContent);

    return (
      <table className="min-w-full divide-y divide-border text-xs">
        <tbody className="divide-y divide-border">
          {entries.map(([key, value], argIdx: number) => (
            <tr key={argIdx}>
              <td className="px-3 py-1.5 font-medium whitespace-nowrap">{key}</td>
              <td className="px-3 py-1.5 text-muted-foreground">
                {isComplexValue(value) ? (
                  <code className="font-mono text-xs break-all">{JSON.stringify(value, null, 2)}</code>
                ) : (
                  String(value)
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return <code className="text-xs whitespace-pre-wrap block">{content}</code>;
}

export function ToolCalls({
  toolCalls,
  toolResults
}: {
  toolCalls: AIMessage['tool_calls'];
  toolResults?: ToolMessage[];
}) {
  if (!toolCalls || toolCalls.length === 0) return null;

  return (
    <div className="space-y-2 w-full max-w-4xl">
      {toolCalls.map((tc, idx) => {
        const args = tc.args as Record<string, any>;
        const result = toolResults?.find((r) => r.tool_call_id === tc.id);
        const [isExpanded, setIsExpanded] = useState(false);

        return (
          <div key={idx}>
            <code
              className={`flex items-center gap-2 text-xs font-mono px-3 py-1.5 rounded-md transition-colors ${
                result ? 'cursor-pointer hover:bg-muted/70' : 'bg-muted/50'
              }`}
              onClick={() => result && setIsExpanded(!isExpanded)}
            >
              <Wrench className="w-3 h-3 shrink-0 opacity-70" />
              <span className="flex-1">{tc.name}({formatArgs(args)})</span>
              {result && (
                <ChevronDown
                  className={`w-3 h-3 shrink-0 transition-transform ${
                    isExpanded ? 'rotate-180' : ''
                  }`}
                />
              )}
            </code>
            <AnimatePresence initial={false}>
              {isExpanded && result && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="mt-1 ml-5 border-l-2 border-muted">
                    <ToolResultContent message={result} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
