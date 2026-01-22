'use client'

import { Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useHealthStream, type HealthStreamUpdate } from '@/hooks/useHealthStream'
import { LogViewer } from '@/components/dashboard/LogViewer'
import { Play, Square, RefreshCw, CheckCircle, ChevronDown } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { AuthProvider } from '@/hooks/useAuth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

const ALL_ACTIONS = [
  { value: 'start', label: 'Start All' },
  { value: 'stop', label: 'Stop All (except core)' },
  { value: 'restart', label: 'Restart All' },
  { value: 'check', label: 'Check All' },
] as const

function StatusPageContent() {
  const router = useRouter()
  const { state: authState } = useAuth()
  const { serviceList, error, refresh } = useHealthStream({ enabled: true })
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [allActionLoading, setAllActionLoading] = useState<string | null>(null)
  const [selectedAllAction, setSelectedAllAction] = useState<'start' | 'stop' | 'restart' | 'check' | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)

  // Show loading skeletons while services are being loaded
  const isInitialLoading = serviceList.length === 0 && !error

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authState.loading && !authState.user) {
      router.replace('/auth/login')
    }
  }, [authState, router])

  // Show loading state while checking auth
  if (authState.loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-sm text-gray-400">Checking authentication...</p>
        </div>
      </div>
    )
  }

  // Not logged in - show login prompt (should redirect, but as fallback)
  if (!authState.user) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Authentication Required</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-400 mb-4">
              You must be logged in to view the service status.
            </p>
            <Button asChild>
              <Link href="/auth/login">Sign In</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const isAdmin = authState.user.role === 'admin'

  const services = serviceList.filter((s: HealthStreamUpdate) =>
    s.service !== 'bernard-ui' && s.service !== 'core'
  )
  const healthyCount = services.filter((s: HealthStreamUpdate) =>
    s.status === 'up'
  ).length
  const totalCount = services.length

  const handleAction = async (serviceId: string, action: 'start' | 'stop' | 'restart' | 'check') => {
    setActionLoading(`${serviceId}-${action}`)
    try {
      const response = await fetch(`/api/services/${serviceId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: action }),
      })
      const result = await response.json()
      if (!response.ok || (!result.success && result.error)) {
        alert(`${action.charAt(0).toUpperCase() + action.slice(1)} failed: ${result.error || result.message || 'Unknown error'}`)
      }
      // SSE will auto-refresh, no manual refresh needed
    } catch (err) {
      alert(`Error: ${err}`)
    } finally {
      setActionLoading(null)
    }
  }

  const handleAllAction = async () => {
    if (!selectedAllAction) return

    setAllActionLoading(selectedAllAction)
    try {
      const promises = services.map((service: HealthStreamUpdate) => {
        if (selectedAllAction === 'stop' && service.service === 'core') {
          return null
        }

        return fetch(`/api/services/${service.service}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: selectedAllAction }),
        })
      })

      const results = await Promise.all(promises)
      const errors = results.filter((r): r is Response => r !== null && r.status >= 400)

      if (errors.length > 0) {
        const errorResults = await Promise.all(errors.map(r => r.json()))
        const errorMsg = errorResults.map((e: { error?: string; message?: string }) => e.error || e.message || 'Unknown error').join('; ')
        alert(`Some actions failed: ${errorMsg}`)
      }
      // SSE will auto-refresh, no manual refresh needed
    } catch (err) {
      alert(`Error: ${err}`)
    } finally {
      setAllActionLoading(null)
      setSelectedAllAction(null)
    }
  }

  const allActions = ALL_ACTIONS

  return (
    <div suppressHydrationWarning className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Service Status</h1>
            <p className="text-gray-400 mt-1">
              {healthyCount}/{totalCount} services healthy
            </p>
          </div>
          {isAdmin && (
          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
              >
                <span>{selectedAllAction ? allActions.find(a => a.value === selectedAllAction)?.label : 'Select Action'}</span>
                <ChevronDown className="w-4 h-4" />
              </button>
              {showDropdown && (
                <div className="absolute right-0 top-full mt-2 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-10 min-w-[200px]">
                  {allActions.map((action) => (
                    <button
                      key={action.value}
                      onClick={() => {
                        setSelectedAllAction(action.value)
                        setShowDropdown(false)
                      }}
                      className="w-full text-left px-4 py-2 hover:bg-gray-700 text-gray-300 transition-colors first:rounded-t-lg last:rounded-b-lg"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={handleAllAction}
              disabled={!selectedAllAction || allActionLoading !== null}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              {allActionLoading === 'start' ? 'Starting...' :
               allActionLoading === 'stop' ? 'Stopping...' :
               allActionLoading === 'restart' ? 'Restarting...' :
               allActionLoading === 'check' ? 'Checking...' : 'Execute'}
            </button>
            <button
              onClick={refresh}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
            >
              Refresh
            </button>
          </div>
          )}
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-6">
            <p className="text-red-400">Failed to load services: {error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {isInitialLoading ? (
            <>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-gray-800 rounded-lg p-4 border border-gray-700 animate-pulse">
                  <div className="h-6 bg-gray-700 rounded w-1/3 mb-4"></div>
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-700 rounded w-full"></div>
                    <div className="h-4 bg-gray-700 rounded w-2/3"></div>
                    <div className="h-4 bg-gray-700 rounded w-1/2"></div>
                  </div>
                </div>
              ))}
            </>
          ) : (
            services.map((service: HealthStreamUpdate) => (
            <div
              key={service.service}
              className="bg-gray-800 rounded-lg p-4 hover:bg-gray-750 transition-colors border border-gray-700 hover:border-gray-600"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-white font-semibold">{service.name}</h3>
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded ${
                  service.status === 'up' ? 'bg-green-900/50 text-green-400' :
                  service.status === 'down' ? 'bg-red-900/50 text-red-400' :
                  service.status === 'starting' ? 'bg-yellow-900/50 text-yellow-400' :
                  'bg-gray-700 text-gray-400'
                }`}>
                  {service.status.toUpperCase()}
                </span>
              </div>

              <div className="flex items-center justify-between text-sm mb-3">
                <div className="flex gap-4 text-gray-400">
                  {service.responseTime !== undefined && (
                    <span>Response: {service.responseTime}ms</span>
                  )}
                </div>
              </div>

              {isAdmin && (
              <div className="action-buttons flex items-center justify-center gap-2 pt-3 border-t border-gray-700">
                <button
                  onClick={() => handleAction(service.service, 'start')}
                  disabled={actionLoading !== null || service.status === 'up'}
                  className={`p-2 rounded transition-colors ${
                    service.status === 'up'
                      ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                      : 'bg-green-900/40 text-green-200 hover:bg-green-600 hover:text-white'
                  }`}
                  title={service.status === 'up' ? 'Already running' : 'Start'}
                >
                  <Play className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleAction(service.service, 'stop')}
                  disabled={actionLoading !== null || service.status === 'down'}
                  className={`p-2 rounded transition-colors ${
                    service.status === 'down'
                      ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                      : 'bg-red-900/40 text-red-200 hover:bg-red-600 hover:text-white'
                  }`}
                  title={service.status === 'down' ? 'Already stopped' : 'Stop'}
                >
                  <Square className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleAction(service.service, 'restart')}
                  disabled={actionLoading !== null}
                  className="p-2 rounded bg-yellow-900/40 text-yellow-200 hover:bg-yellow-600 hover:text-white disabled:bg-gray-600 disabled:cursor-not-allowed disabled:text-gray-500 transition-colors"
                  title="Restart"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleAction(service.service, 'check')}
                  disabled={actionLoading !== null}
                  className="p-2 rounded bg-blue-900/40 text-blue-200 hover:bg-blue-600 hover:text-white disabled:bg-gray-600 disabled:cursor-not-allowed disabled:text-gray-500 transition-colors"
                  title="Check"
                >
                  <CheckCircle className="w-4 h-4" />
                </button>
              </div>
              )}
            </div>
            ))}
          )}
        </div>

        <div className="mb-8">
          <h2 className="text-xl font-semibold text-white mb-4">Live Logs</h2>
          <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            <LogViewer height="300px" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function StatusPage() {
  return (
    <AuthProvider>
      <Suspense fallback={<div>Loading...</div>}>
        <StatusPageContent />
      </Suspense>
    </AuthProvider>
  )
}
