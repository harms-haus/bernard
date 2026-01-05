import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Thread } from '../components/chat/Thread';
import { StreamProvider } from '../providers/StreamProvider';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function Chat() {
  const [searchParams, setSearchParams] = useSearchParams();
  const threadId = searchParams.get('threadId');

  useEffect(() => {
    if (threadId && !UUID_REGEX.test(threadId)) {
      console.warn(`Invalid thread ID found: ${threadId}. Clearing from URL.`);
      setSearchParams({}, { replace: true });
    }
  }, [threadId, setSearchParams]);

  // Connect through the proxy API (port 3456) which routes to bernard-agent (port 2024)
  const apiUrl = window.location.origin;
  const assistantId = 'bernard_agent';

  const validThreadId = threadId && UUID_REGEX.test(threadId) ? threadId : null;

  return (
    <StreamProvider apiUrl={apiUrl} assistantId={assistantId} threadId={validThreadId}>
      <Thread />
    </StreamProvider>
  );
}
