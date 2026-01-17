"use client";

import Link from 'next/link';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Home,
} from 'lucide-react';
import { AuthProvider } from '@/hooks/useAuth';
import { DarkModeProvider } from '@/hooks/useDarkMode';
import { ToastManagerProvider } from '@/components/ToastManager';
import { DialogManagerProvider } from '@/components/DialogManager';
import { AdminSidebarConfig } from '@/components/dynamic-sidebar/configs';

import { PageHeaderConfig } from '@/components/dynamic-header/configs';

function AdminLayoutContent({ children }: { children: React.ReactNode }) {
  const { isAdmin, isAdminLoading } = useAdminAuth();

  if (isAdminLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-sm text-muted-foreground">Checking admin privileges...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              You don&apos;t have admin privileges to access this area.
            </p>
            <div className="flex gap-2">
              <Button asChild>
                <Link href="/" className="flex items-center">
                  <Home className="mr-2 h-4 w-4" />
                  Back to Home
                </Link>
              </Button>
              <Button variant="outline" onClick={() => window.location.href = '/bernard/user/profile'}>
                Profile
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

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
