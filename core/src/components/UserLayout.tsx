'use client'

import { Outlet, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useDarkMode } from '@/hooks/useDarkMode'
import { UserSidebarConfig } from './dynamic-sidebar/configs/UserSidebarConfig'
import { PageHeaderConfig } from './dynamic-header/configs/PageHeaderConfig'
import { cn } from '@/lib/utils'

export function UserLayout({ children }: { children: React.ReactNode }) {
  const { isDarkMode } = useDarkMode()

  return (
    <div className={cn('min-h-screen', isDarkMode && 'dark')}>
      <UserSidebarConfig>
        <PageHeaderConfig title="Bernard" subtitle="Dashboard">
          {children}
        </PageHeaderConfig>
      </UserSidebarConfig>
    </div>
  )
}

export function UserLayoutWrapper() {
  const navigate = useNavigate()
  const { state: authState } = useAuth()

  useEffect(() => {
    // Redirect to login when user is not authenticated (null) and not loading
    if (!authState.loading && !authState.user) {
      navigate('/auth/login', { replace: true })
      return
    }
    // Redirect to chat when user is a guest
    if (!authState.loading && authState.user?.role === 'guest') {
      navigate('/bernard/chat', { replace: true })
      return
    }
  }, [authState, navigate])

  // Don't render anything while checking auth, if unauthenticated, or if guest
  if (authState.loading || !authState.user || authState.user?.role === 'guest') {
    return null
  }

  return (
    <UserLayout>
      <Outlet />
    </UserLayout>
  )
}
