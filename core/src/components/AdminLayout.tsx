'use client'

import { Outlet, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { AdminSidebarConfig } from './dynamic-sidebar/configs/AdminSidebarConfig'
import { PageHeaderConfig } from './dynamic-header/configs/PageHeaderConfig'
import { cn } from '@/lib/utils'

export function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminSidebarConfig>
      <main className="flex-1 p-6 overflow-y-auto">
        <PageHeaderConfig title="Admin Panel" subtitle="System Management">
          {children}
        </PageHeaderConfig>
      </main>
    </AdminSidebarConfig>
  )
}

export function AdminLayoutWrapper() {
  const navigate = useNavigate()
  const { state: authState } = useAuth()

  useEffect(() => {
    // Redirect to login when user is not authenticated
    if (!authState.loading && !authState.user) {
      navigate('/auth/login', { replace: true })
      return
    }

    // Redirect to 403 when user is not admin
    if (!authState.loading && authState.user?.role !== 'admin') {
      navigate('/403', { replace: true })
      return
    }
  }, [authState, navigate])

  // Don't render anything while checking auth, if unauthenticated, or if not admin
  if (authState.loading || !authState.user || authState.user?.role !== 'admin') {
    return null
  }

  return (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  )
}
