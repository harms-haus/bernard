"use client";

import { StatusDashboard } from '@/components/StatusDashboard';
import { AuthProvider } from '@/hooks/useAuth';
import { DarkModeProvider } from '@/hooks/useDarkMode';
import { ToastManagerProvider } from '@/components/ToastManager';
import { redirectIfNotAdmin } from '@/lib/auth/client-helpers';

export default function Dashboard() {
  redirectIfNotAdmin();

  return (
    <AuthProvider>
      <DarkModeProvider>
        <ToastManagerProvider>
          <StatusDashboard showRestartButtons={true} showLogs={true} />
        </ToastManagerProvider>
      </DarkModeProvider>
    </AuthProvider>
  );
}
