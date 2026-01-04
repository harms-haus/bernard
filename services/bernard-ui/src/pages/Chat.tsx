import { Thread } from '../components/chat/Thread';
import { StreamProvider } from '../providers/StreamProvider';

export function Chat() {
  // Connect through the proxy API (port 3456) which routes to bernard-agent (port 2024)
  const apiUrl = 'http://localhost:3456';
  const assistantId = 'bernard_agent';

  return (
    <StreamProvider apiUrl={apiUrl} assistantId={assistantId}>
      <Thread />
    </StreamProvider>
  );
}
