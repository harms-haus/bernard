import { useDarkMode } from '../../hooks/useDarkMode';

interface ThinkingMessageProps { }

export function ThinkingMessage({}: ThinkingMessageProps) {
  const { isDarkMode } = useDarkMode();
  
  return (
    <div className="max-w-xs lg:max-w-md px-4 py-2 rounded-full relative group">
      <div className="text-xs whitespace-pre-wrap break-words">
        Thinking...
      </div>
    </div>
  );
}