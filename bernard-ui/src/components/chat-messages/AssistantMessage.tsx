import * as React from 'react';
import { Button } from '../ui/button';
import { Copy, RefreshCw, Ghost } from 'lucide-react';
import { useDarkMode } from '../../hooks/useDarkMode';

interface AssistantMessageProps {
  content: string;
  toolsUsed?: string[];
  showToolDetails?: boolean;
  onCopy?: () => void;
  onToggleToolDetails?: () => void;
}

export function AssistantMessage({
  content,
  toolsUsed,
  showToolDetails = false,
  onCopy,
  onToggleToolDetails
}: AssistantMessageProps) {
  const { isDarkMode } = useDarkMode();
  
  return (
    <div className="max-w-xs lg:max-w-md px-4 py-2 rounded-lg relative group">
      <div className="text-sm whitespace-pre-wrap break-words">
        {content}
      </div>
      
      {/* Ghost icon buttons for assistant messages */}
      <div className="flex items-center space-x-2 mt-2">
        <Button
          variant="ghost"
          size="sm"
          className={`h-6 w-6 p-1 ${isDarkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
          onClick={onCopy}
          title="Copy to clipboard"
        >
          <Copy className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={`h-6 w-6 p-1 ${isDarkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
          disabled
          title="Regenerate (not implemented)"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
        {toolsUsed && toolsUsed.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className={`h-6 w-6 p-1 ${isDarkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={onToggleToolDetails}
            title="Show tools used"
          >
            <Ghost className="h-3 w-3" />
          </Button>
        )}
      </div>
      
      {/* Tool details (unique tools only) */}
      {toolsUsed && showToolDetails && (
        <div className={`mt-2 p-2 rounded text-xs ${isDarkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
          <div className={`font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Tools used:</div>
          <div className="flex flex-wrap gap-1">
            {[...new Set(toolsUsed)].map((tool, index) => (
              <span key={index} className={`${isDarkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-200 text-gray-700'} px-2 py-1 rounded`}>
                {tool}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}