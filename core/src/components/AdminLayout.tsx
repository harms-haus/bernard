"use client";

import { AuthProvider } from '@/hooks/useAuth';
import { DarkModeProvider } from '@/hooks/useDarkMode';
import { ToastManagerProvider } from '@/components/ToastManager';
import { DialogManagerProvider } from '@/components/DialogManager';
import { AdminSidebarConfig } from '@/components/dynamic-sidebar/configs';
import { PageHeaderConfig } from '@/components/dynamic-header/configs';

function AdminLayoutContent({ children }: { children: React.ReactNode }) {
  return (
    <AdminSidebarConfig>
      <PageHeaderConfig title="Admin Panel" subtitle="System Administration">
        <div className="flex-1 flex flex-col overflow-hidden h-full">
          <main className="flex-1 overflow-y-auto p-6 bg-background">
            {children}
          </main>
        </div>
      </PageHeaderConfig>
    </AdminSidebarConfig>
  );
}

export function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DarkModeProvider>
        <DialogManagerProvider>
          <ToastManagerProvider>
            <AdminLayoutContent>{children}</AdminLayoutContent>
          </ToastManagerProvider>
        </DialogManagerProvider>
      </DarkModeProvider>
    </AuthProvider>
  );
}
