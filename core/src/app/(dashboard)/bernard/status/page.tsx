import { StatusDashboard } from '@/components/StatusDashboard';
import { AuthProvider } from '@/hooks/useAuth';
import { DarkModeProvider } from '@/hooks/useDarkMode';

function StatusContent() {
  return <StatusDashboard showRestartButtons={false} showLogs={false} />;
}

export default function StatusPage() {
  return (
    <AuthProvider>
      <DarkModeProvider>
        <StatusContent />
      </DarkModeProvider>
    </AuthProvider>
  );
}
