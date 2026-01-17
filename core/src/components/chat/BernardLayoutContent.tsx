'use client';

import { Suspense } from 'react';
import { useSidebarState } from './SidebarProvider';
import { BernardHeader } from './BernardHeader';
import { ConversationHistory } from './ConversationHistory';
import { cn } from '@/lib/utils';

export function BernardLayoutContent({ children }: { children: React.ReactNode }) {
  const [isOpen] = useSidebarState();

  return (
    <div className="flex w-full h-screen overflow-hidden bg-background">
      {/* Sidebar - full height, left side */}
      <div
        className={cn(
          "hidden lg:flex flex-col h-screen shrink-0 border-r bg-background relative transition-all duration-300",
          isOpen ? "w-[300px]" : "w-0 overflow-hidden"
        )}
      >
        <Suspense fallback={null}>
          <ConversationHistory />
        </Suspense>
      </div>

      {/* Main content area - right of sidebar */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <BernardHeader />
        <main className="flex-1 overflow-hidden">
          <Suspense fallback={null}>
            {children}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
