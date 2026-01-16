import { StatusDashboard } from '@/components/StatusDashboard';
import { redirectIfNotAuthenticated } from '@/lib/auth/client-helpers';

export default async function StatusPage() {
  const _ = await redirectIfNotAuthenticated();
  return <StatusDashboard showRestartButtons={false} showLogs={false} />;
}
