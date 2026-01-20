"use client";

import { useEffect, use } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { Thread } from '@/components/chat/thread';
import { StreamProvider } from '@/components/chat/thread/providers/Stream';
import { ThreadProvider } from '@/components/chat/thread/providers/Thread';
import { useDynamicHeader } from '@/components/dynamic-header';
import { useThreads } from '@/components/chat/thread/providers/Thread';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function ChatHeaderController() {
  const searchParams = useSearchParams();
  const threadId = searchParams.get('threadId');
  const { threads } = useThreads();
  const { setTitle, setSubtitle, reset } = useDynamicHeader();

  useEffect(() => {
    if (threadId && UUID_REGEX.test(threadId)) {
      const thread = threads.find(t => t.thread_id === threadId);
      setTitle('Chat');
      let threadName = 'New Chat';
      if (thread?.values && 'messages' in thread.values && Array.isArray(thread.values.messages) && thread.values.messages.length > 0) {
        const firstMsg = thread.values.messages[0];
        threadName = typeof firstMsg.content === 'string' ? firstMsg.content : 'New Chat';
      }
      setSubtitle(threadName);
    } else {
      setTitle('Chat');
      setSubtitle('New Chat');
    }
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

  const apiUrl = (process.env.NEXT_PUBLIC_BERNARD_AGENT_URL || 'http://localhost:2024').replace(/\/$/, '');
  const assistantId = 'bernard_agent';

  return (
    <ChatSidebarConfig>
      <ChatHeaderConfig>
        <ThreadProvider apiUrl={apiUrl} assistantId={assistantId}>
          <StreamProvider apiUrl={apiUrl} assistantId={assistantId}>
            <ChatHeaderController />
            <Thread />
          </StreamProvider>
        </ThreadProvider>
      </ChatHeaderConfig>
    </ChatSidebarConfig>
  );
}
