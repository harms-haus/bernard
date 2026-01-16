"use client";

import { useEffect, use } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { Thread } from '@/components/chat/Thread';
import { StreamProvider } from '@/providers/StreamProvider';
import { ThreadProvider } from '@/providers/ThreadProvider';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function Chat() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const threadId = searchParams.get('threadId');

  useEffect(() => {
    if (threadId && !UUID_REGEX.test(threadId)) {
      console.warn(`Invalid thread ID found: ${threadId}. Clearing from URL.`);
      router.replace('/bernard/chat');
    }
  }, [threadId, router]);

  // Use LangGraph native streaming endpoints (proxied through :3456)
  const apiUrl = '/api/threads'; // Base URL for LangGraph API
  const assistantId = 'bernard_agent';

  const validThreadId = threadId && UUID_REGEX.test(threadId) ? threadId : null;

  return (
    <ThreadProvider>
      <StreamProvider apiUrl={apiUrl} assistantId={assistantId} threadId={validThreadId} useLangGraphStream={true}>
        <Thread />
      </StreamProvider>
    </ThreadProvider>
  );
}
