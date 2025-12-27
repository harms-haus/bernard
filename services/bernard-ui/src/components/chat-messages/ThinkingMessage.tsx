
interface ThinkingMessageProps {
  statusMessage?: string;
}

export function ThinkingMessage({ statusMessage }: ThinkingMessageProps) {

  return (
    <div className="max-w-xs lg:max-w-md px-4 py-2 rounded-full relative group">
      <div className="text-xs whitespace-pre-wrap break-words">
        {statusMessage || "Thinking..."}
      </div>
    </div>
  );
}