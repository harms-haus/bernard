import * as React from 'react';
import { Wrench, ChevronDown, Loader2 } from 'lucide-react';
import { useDarkMode } from '../../hooks/useDarkMode';

interface ToolCallMessageProps {
  toolCall: {
    id: string;
    function: {
      name: string;
      arguments: string;
    };
  };
  status: 'loading' | 'completed';
  result?: any;
}

export function ToolCallMessage({
  toolCall,
  status,
  result
}: ToolCallMessageProps) {
  const { isDarkMode } = useDarkMode();
  const [isExpanded, setIsExpanded] = React.useState(false);

  const getStyles = () => {
    return {
      container: isDarkMode
        ? 'bg-gray-700/40 border-gray-500/60 text-gray-300'
        : 'bg-gray-200/40 border-gray-400/60 text-gray-700',
      border: 'border-gray-500/40'
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
    return result;
  };

  const formatArguments = (args: string): string => {
    if (!args) return 'No arguments';
    try {
      const parsed = JSON.parse(args);
      if (!parsed || typeof parsed !== 'object') return args;
      return Object.entries(parsed)
        .map(([key, value]) => `${key}: ${typeof value === 'string' ? `"${value}"` : JSON.stringify(value)}`)
        .join(', ');
    } catch {
      return args;
    }
  };

  return (
    <div className={`max-w-xs lg:max-w-md rounded-sm ml-4 px-2 py-1 border ${styles.container} ${styles.border}`}>
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
            <Wrench className="h-3 w-3 flex-shrink-0 opacity-60" />
          )}
          <div className="text-xs font-mono break-words flex-1 opacity-75">
            Tool Call: {toolCall?.function?.name || 'Unknown Tool'}
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
            <div className="text-sm">
              <div className="font-medium text-xs mb-1 opacity-75">
                Tool ID:
              </div>
              <div className="text-xs font-mono bg-black/10 dark:bg-white/10 p-2 rounded break-all">
                {toolCall.id}
              </div>
            </div>
            <div className="text-sm">
              <div className="font-medium text-xs mb-1 opacity-75">
                Function:
              </div>
              <div className="text-xs font-mono bg-black/10 dark:bg-white/10 p-2 rounded break-all">
                {toolCall.function.name}
              </div>
            </div>
            <div className="text-sm">
              <div className="font-medium text-xs mb-1 opacity-75">
                Arguments:
              </div>
              <div className="text-xs font-mono bg-black/10 dark:bg-white/10 p-2 rounded break-all">
                {toolCall?.function?.arguments ? formatArguments(toolCall.function.arguments) : 'No arguments'}
              </div>
            </div>
            {status === 'completed' && result && (
              <div className="text-sm">
                <div className="font-medium text-xs mb-1 opacity-75">
                  Result:
                </div>
                <div className="text-xs font-mono bg-black/10 dark:bg-white/10 p-2 rounded break-all">
                  {getResultContent()}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
