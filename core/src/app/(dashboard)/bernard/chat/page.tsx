"use client";

import { useEffect, use } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { Thread } from '@/components/chat/Thread';
import { StreamProvider } from '@/providers/StreamProvider';
import { ThreadProvider } from '@/providers/ThreadProvider';
import { useHeaderService } from '@/components/chat/HeaderService';
import { useThreads } from '@/providers/ThreadProvider';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function ChatHeaderController() {
  const searchParams = useSearchParams();
  const threadId = searchParams.get('threadId');
  const { threads } = useThreads();
  const { setTitle, setSubtitle, reset } = useHeaderService();

  useEffect(() => {
    if (threadId && UUID_REGEX.test(threadId)) {
      const thread = threads.find(t => t.id === threadId);
      if (thread && thread.name) {
        setTitle(thread.name);
        setSubtitle('Chat');
      } else {
        setTitle('Bernard');
        setSubtitle('Chat');
      }
    } else {
      reset();
    }
  }, [threadId, threads, setTitle, setSubtitle, reset]);

  return null;
}

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
        <ChatHeaderController />
        <Thread />
      </StreamProvider>
    </ThreadProvider>
  );
}
