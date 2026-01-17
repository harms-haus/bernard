"use client";

import { useDarkMode } from '@/hooks/useDarkMode';
import { UserSidebarConfig } from '@/components/dynamic-sidebar/configs';
import { PageHeaderConfig } from '@/components/dynamic-header/configs';

export function UserLayout({ children }: { children: React.ReactNode }) {
  const { isDarkMode } = useDarkMode();

  return (
    <div className={`min-h-screen ${isDarkMode ? 'dark' : ''}`}>
      <UserSidebarConfig>
        <PageHeaderConfig title="Bernard" subtitle="Dashboard">
          <div className="flex h-screen bg-background">
            <div className="flex-1 flex flex-col overflow-hidden">
              <main className="flex-1 overflow-y-auto bg-background">
                {children}
              </main>
            </div>
          </div>
        </PageHeaderConfig>
      </UserSidebarConfig>
    </div>
  );
}
