"use client";

import { ServiceStatusPanel } from '@/components/ServiceStatusPanel';
import { AdminLayout } from '@/components/AdminLayout';

import { PageHeaderConfig } from '@/components/dynamic-header/configs';

function DashboardContent() {
  return (
    <>
      <PageHeaderConfig title="Admin Panel" subtitle="System Status" />
      <ServiceStatusPanel title="Service Status" showLogs={true} />
    </>
  );
}

export default function DashboardPage() {
  return (
    <AdminLayout>
      <DashboardContent />
    </AdminLayout>
  );
}
