import { StatusDashboard } from '@/components/StatusDashboard';
import { redirectIfNotAdmin } from '@/lib/auth/client-helpers';

export default async function Dashboard() {
  const _ = await redirectIfNotAdmin();
  return <StatusDashboard showRestartButtons={true} showLogs={true} />;
}
