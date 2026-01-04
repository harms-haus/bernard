import { Thread } from '../components/chat/Thread';
import { StreamProvider } from '../providers/StreamProvider';

export function Chat() {
  // The API URL points directly to the Bernard server
  // Bernard core runs on port 8850 (see services/bernard/server.ts)
  const apiUrl = 'http://localhost:8850';
  const assistantId = 'bernard';

  return (
    <StreamProvider apiUrl={apiUrl} assistantId={assistantId}>
      <Thread />
    </StreamProvider>
  );
}
