import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { useDarkMode } from '../../hooks/useDarkMode';

interface ToolUseMessageProps {
  toolName: string;
  arguments: Record<string, any>;
  toolUseId: string;
  status: 'in-progress' | 'success' | 'failure';
  response?: string;
  error?: string;
}

export function ToolUseMessage({
  toolName,
  arguments: args,
  toolUseId,
  status,
  response,
  error
}: ToolUseMessageProps) {
  const { isDarkMode } = useDarkMode();
  const [isExpanded, setIsExpanded] = React.useState(false);

  const formatArguments = (args: Record<string, any>): string => {
    const formattedArgs = Object.entries(args)
      .map(([key, value]) => `${key}: ${typeof value === 'string' ? `"${value}"` : value}`)
      .join(', ');
    return `${toolName}(${formattedArgs})`;
  };

  const getStatusStyles = () => {
    switch (status) {
      case 'success':
        return {
          container: isDarkMode 
            ? 'bg-gray-700 border-green-600 text-green-100' 
            : 'bg-gray-50 border-green-300 text-green-800',
          border: 'border-green-500'
        };
      case 'failure':
        return {
          container: isDarkMode 
            ? 'bg-gray-700 border-red-600 text-red-100' 
            : 'bg-gray-50 border-red-300 text-red-800',
          border: 'border-red-500'
        };
      case 'in-progress':
      default:
        return {
          container: isDarkMode 
            ? 'bg-gray-700 border-gray-500 text-gray-300' 
            : 'bg-gray-50 border-gray-300 text-gray-700',
          border: 'border-gray-400'
        };
    }
  };

  const styles = getStatusStyles();
  const isCompleted = status !== 'in-progress';

  const handleToggleExpanded = () => {
    if (isCompleted) {
      setIsExpanded(!isExpanded);
    }
  };

  const getResponseContent = () => {
    if (status === 'failure' && error) {
      return error;
    }
    return response || '';
  };

  return (
    <div className={`max-w-xs lg:max-w-md rounded-sm ml-12 px-2 py-1 border ${styles.container} ${styles.border}`}>
      <div 
        className={`flex items-center justify-between cursor-pointer ${isCompleted ? 'hover:opacity-80' : ''}`}
        onClick={handleToggleExpanded}
      >
        <div className="text-xs font-mono break-words flex-1">
          {formatArguments(args)}
        </div>
        {isCompleted && (
          <ChevronDown 
            className={`h-4 w-4 ml-2 transition-transform duration-200 flex-shrink-0 ${
              isExpanded ? 'rotate-180' : ''
            }`}
          />
        )}
      </div>
      
      {isExpanded && isCompleted && (
        <div className={`mt-3 pt-3 border-t ${styles.border}`}>
          <div className="text-sm whitespace-pre-wrap break-words font-mono">
            {getResponseContent()}
          </div>
        </div>
      )}
    </div>
  );
}