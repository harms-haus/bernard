"use client";

import { useEffect } from 'react';
import { useSearchParams } from '@/lib/router/compat';
import { useRouter } from '@/lib/router/compat';
import { Thread } from '@/components/chat/thread';
import { StreamProvider } from '@/components/chat/thread/providers/Stream';
import { ThreadProvider } from '@/components/chat/thread/providers/Thread';
import { useDynamicHeader } from '@/components/dynamic-header';
import { useThreads } from '@/components/chat/thread/providers/Thread';
import { AgentSelectorProvider, useAgentSelector } from '@/components/chat/AgentSelector';
import { useAuth } from '@/hooks/useAuth';
import { UserRole } from '@/lib/auth/types';
import { ChatSidebarConfig } from '@/components/dynamic-sidebar/configs';
import { ChatHeaderConfig } from '@/components/dynamic-header/configs';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function ChatHeaderController() {
  const [searchParams] = useSearchParams();
  const threadId = searchParams.get('threadId');
  const { threads } = useThreads();
  const { setTitle, setSubtitle, reset } = useDynamicHeader();

  useEffect(() => {
    if (threadId && UUID_REGEX.test(threadId)) {
      const thread = threads.find(t => t.thread_id === threadId);
      setTitle('Chat');
      let threadName = 'New Chat';
      if (thread?.metadata?.name) {
        threadName = typeof thread.metadata.name === 'string' ? thread.metadata.name : 'New Chat';
      } else if (thread?.values && 'messages' in thread.values && Array.isArray(thread.values.messages) && thread.values.messages.length > 0) {
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

function ChatContent() {
  const { selectedAgent } = useAgentSelector();
  const [searchParams] = useSearchParams();
  const router = useRouter();
  const threadId = searchParams.get('threadId');

  useEffect(() => {
    if (threadId && !UUID_REGEX.test(threadId)) {
      console.warn(`Invalid thread ID found: ${threadId}. Clearing from URL.`);
      router.replace('/bernard/chat');
    }
  }, [threadId, router]);

  const apiUrl = `${(import.meta.env.VITE_APP_URL || 'http://localhost:3456').replace(/\/$/, '')}/api`;

  return (
    <ThreadProvider apiUrl={apiUrl} assistantId={selectedAgent}>
      <StreamProvider apiUrl={apiUrl} assistantId={selectedAgent}>
        <ChatHeaderController />
        <Thread />
      </StreamProvider>
    </ThreadProvider>
  );
}

export function Chat() {
  const { state } = useAuth();

  // Use session role if available, otherwise default to guest
  const userRole: UserRole = state.user?.role ?? 'guest';

  return (
    <ChatSidebarConfig>
      <ChatHeaderConfig>
        <AgentSelectorProvider userRole={userRole}>
          <ChatContent />
        </AgentSelectorProvider>
      </ChatHeaderConfig>
    </ChatSidebarConfig>
  );
}
