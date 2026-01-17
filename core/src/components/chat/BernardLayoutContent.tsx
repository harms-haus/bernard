'use client';

import { Suspense } from 'react';
import { BernardHeader } from './BernardHeader';
import { DynamicSidebar } from '../dynamic-sidebar';

export function BernardLayoutContent({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-full h-screen overflow-hidden bg-background">
      <DynamicSidebar />

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
