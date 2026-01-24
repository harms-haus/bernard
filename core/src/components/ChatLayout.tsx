'use client'

import { Outlet, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'

export function ChatLayout() {
  const navigate = useNavigate()
  const { state: authState } = useAuth()

  useEffect(() => {
    // Redirect to login when user is not authenticated
    if (!authState.loading && !authState.user) {
      navigate('/auth/login', { replace: true })
      return
    }
  }, [authState, navigate])

  // Don't render anything while checking auth or if unauthenticated
  if (authState.loading || !authState.user) {
    return null
  }

  return <Outlet />
}
