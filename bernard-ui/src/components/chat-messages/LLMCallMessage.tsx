import * as React from 'react';
import { Cpu, ChevronDown, Loader2 } from 'lucide-react';
import { useDarkMode } from '../../hooks/useDarkMode';

interface LLMCallMessageProps {
  model?: string;
  context: any[];
  tools?: string[];
  toolCallCount?: number;
  status: 'loading' | 'completed';
  result?: any;
  totalContextTokens?: number;
  actualTokens?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export function LLMCallMessage({
  model,
  context,
  tools,
  toolCallCount,
  status,
  result,
  totalContextTokens,
  actualTokens
}: LLMCallMessageProps) {
  const { isDarkMode } = useDarkMode();
  const [isExpanded, setIsExpanded] = React.useState(false);

  const getStyles = () => {
    return {
      container: isDarkMode
        ? 'bg-gray-800/30 border-gray-600/50 text-gray-300'
        : 'bg-gray-100/50 border-gray-300/50 text-gray-600',
      border: 'border-gray-400/30'
    };
  };

  const styles = getStyles();

  const handleToggleExpanded = () => {
    if (status === 'completed') {
      setIsExpanded(!isExpanded);
    }
  };

  const getResultContent = () => {
    if (!result) return null;

    try {
      if (typeof result.content === 'string') {
        return result.content;
      }
      return JSON.stringify(result, null, 2);
    } catch {
      return 'Result processing failed';
    }
  };

  const formatContext = (ctx: any[]) => {
    if (!Array.isArray(ctx)) return [];
    return ctx.map((msg, idx) => {
      let role = 'unknown';
      let content = '';

      if (msg) {
        // Try different ways to get the role, but skip 'constructor'
        role = (msg as any).type || (msg as any)._type || (msg as any)._getType?.() || msg.role;

        // If role is still undefined or 'constructor', try to infer from other properties
        if (!role || role === 'constructor') {
          // Check for LangChain-style properties
          if ((msg as any).lc_serializable === false) {
            // This might be a serialized LangChain object, try to find the type
            if (msg.constructor && msg.constructor.name) {
              const constructorName = msg.constructor.name;
              if (constructorName.includes('System')) role = 'system';
              else if (constructorName.includes('Human')) role = 'user';
              else if (constructorName.includes('AI') || constructorName.includes('Assistant')) role = 'assistant';
              else if (constructorName.includes('Tool')) role = 'tool';
            }
          }
        }

        // Map LangChain message types to OpenAI roles
        if (role === 'system') role = 'system';
        else if (role === 'human') role = 'user';
        else if (role === 'ai') role = 'assistant';
        else if (role === 'tool') role = 'tool';

        // Default to unknown if we still don't have a role
        if (!role || role === 'constructor') role = 'message';

        // For now, just show a simple summary since the content parsing is problematic
        content = `[${role} message ${idx + 1}]`;
      }

      return {
        role,
        content,
        index: idx
      };
    });
  };

  const formattedContext = formatContext(context);

  return (
    <div className={`max-w-xs lg:max-w-md rounded-sm ml-0 px-2 py-1 border ${styles.container} ${styles.border}`}>
      <div
        role="button"
        tabIndex={status === 'completed' ? 0 : -1}
        aria-expanded={status === 'completed' ? isExpanded : undefined}
        className={`flex items-center justify-between ${status === 'completed' ? 'cursor-pointer hover:opacity-80' : ''}`}
        onClick={handleToggleExpanded}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleToggleExpanded();
          }
        }}
      >
        <div className="flex items-center space-x-2 flex-1">
          {status === 'loading' ? (
            <Loader2 className="h-3 w-3 flex-shrink-0 animate-spin opacity-60" />
          ) : (
            <Cpu className="h-3 w-3 flex-shrink-0 opacity-60" />
          )}
          <div className="text-xs font-mono break-words flex-1 opacity-75">
            LLM Call{model ? `: ${model}` : ''}{toolCallCount && toolCallCount > 0 ? ` • ${toolCallCount} tool${toolCallCount === 1 ? '' : 's'}` : ''}            {(() => {
              if (actualTokens?.promptTokens && actualTokens?.completionTokens && totalContextTokens) {
                return ` • ~${totalContextTokens} [${actualTokens.promptTokens}] → ${actualTokens.completionTokens} tokens`;
              } else if (actualTokens?.totalTokens && totalContextTokens) {
                return ` • ~${totalContextTokens} → ${actualTokens.totalTokens} tokens`;
              } else if (actualTokens?.totalTokens) {
                return ` • ${actualTokens.totalTokens} tokens`;
              } else if (totalContextTokens) {
                return ` • ~${totalContextTokens} tokens`;
              }
              return '';
            })()}
          </div>
        </div>
        {status === 'completed' && (
          <ChevronDown
            className={`h-3 w-3 ml-2 transition-transform duration-200 flex-shrink-0 opacity-60 ${
              isExpanded ? 'rotate-180' : ''
            }`}
          />
        )}
      </div>

      {isExpanded && (
        <div className={`mt-3 pt-3 border-t ${styles.border}`}>
          <div className="space-y-2">
            {formattedContext.map((msg) => (
              <div key={msg.index} className="text-sm">
                <div className="font-medium text-xs mb-1 opacity-75">
                  {msg.role}:
                </div>
                <div className="whitespace-pre-wrap break-words font-mono text-xs bg-black/10 dark:bg-white/10 p-2 rounded">
                  {msg.content && typeof msg.content === 'string' && msg.content.length > 200 ? `${msg.content.substring(0, 200)}...` : msg.content || 'No content'}
                </div>
              </div>
            ))}
            {tools && tools.length > 0 && (
              <div className="text-sm">
                <div className="font-medium text-xs mb-1 opacity-75">
                  Tools:
                </div>
                <div className="flex flex-wrap gap-1">
                  {tools.map((tool, idx) => (
                    <span key={idx} className="text-xs bg-black/20 dark:bg-white/20 px-2 py-1 rounded font-mono">
                      {tool}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {status === 'completed' && result && (
              <div className="text-sm">
                <div className="font-medium text-xs mb-1 opacity-75">
                  Result:
                </div>
                <div className="whitespace-pre-wrap break-words font-mono text-xs bg-black/10 dark:bg-white/10 p-2 rounded">
                  {getResultContent()}
                </div>
              </div>
            )}
            {status === 'completed' && actualTokens && (
              <div className="text-sm">
                <div className="font-medium text-xs mb-1 opacity-75">
                  Token Usage:
                </div>
                <div className="text-xs font-mono bg-black/10 dark:bg-white/10 p-2 rounded">
                  Prompt: {actualTokens.promptTokens} tokens<br />
                  Completion: {actualTokens.completionTokens} tokens<br />
                  Total: {actualTokens.totalTokens} tokens
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
