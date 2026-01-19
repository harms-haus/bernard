"use client";

import { useEffect, use } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { Thread } from '@/components/chat/Thread';
import { StreamProvider } from '@/providers/StreamProvider';
import { ThreadProvider } from '@/providers/ThreadProvider';
import { useDynamicHeader } from '@/components/dynamic-header';
import { useThreads } from '@/providers/ThreadProvider';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function ChatHeaderController() {
  const searchParams = useSearchParams();
  const threadId = searchParams.get('threadId');
  const { threads } = useThreads();
  const { setTitle, setSubtitle, reset } = useDynamicHeader();

  useEffect(() => {
    if (threadId && UUID_REGEX.test(threadId)) {
      const thread = threads.find(t => t.id === threadId);
      setTitle('Chat');
      setSubtitle(thread?.name || 'New Chat');
    } else {
      setTitle('Chat');
      setSubtitle('New Chat');
    }
    // We don't call reset() here because it would clear actions set by useChatHeaderConfig
  }, [threadId, threads, setTitle, setSubtitle]);

  return null;
}

import { ChatSidebarConfig } from '@/components/dynamic-sidebar/configs';
import { ChatHeaderConfig } from '@/components/dynamic-header/configs';

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

  // Use LangGraph native streaming endpoints
  // The SDK expects the LangGraph server URL, not a relative path
  const apiUrl = (process.env.NEXT_PUBLIC_BERNARD_AGENT_URL || 'http://localhost:2024').replace(/\/$/, '');
  const assistantId = 'bernard_agent';

  const validThreadId = threadId && UUID_REGEX.test(threadId) ? threadId : null;

  return (
    <ChatSidebarConfig>
      <ChatHeaderConfig>
        <StreamProvider apiUrl={apiUrl} assistantId={assistantId} threadId={validThreadId}>
          <ChatHeaderController />
          <Thread />
        </StreamProvider>
      </ChatHeaderConfig>
    </ChatSidebarConfig>
  );
}
