import { useDarkMode } from '../../hooks/useDarkMode';

interface UserMessageProps {
  content: string;
}

export function UserMessage({ content }: UserMessageProps) {
  const { isDarkMode } = useDarkMode();
  
  return (
    <div className={`max-w-xs lg:max-w-md mr-4 px-4 py-2 rounded-full relative group ${
      isDarkMode ? 'bg-gray-800 text-gray-100 border border-gray-700' : 'bg-white text-gray-900 border border-gray-200 shadow-sm'
    }`}>
      <div className="text-sm whitespace-pre-wrap break-words">
        {content}
      </div>
    </div>
  );
}