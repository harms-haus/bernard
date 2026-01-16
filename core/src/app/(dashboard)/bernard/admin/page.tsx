"use client";

import { StatusDashboard } from '@/components/StatusDashboard';
import { AdminLayout } from '@/components/AdminLayout';

function DashboardContent() {
  return <StatusDashboard showRestartButtons={true} showLogs={true} />;
}

export default function DashboardPage() {
  return (
    <AdminLayout>
      <DashboardContent />
    </AdminLayout>
  );
}
