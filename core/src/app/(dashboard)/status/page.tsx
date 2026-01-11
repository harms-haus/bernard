'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useServiceStatus, type ServiceStatus } from '@/hooks/useServiceStatus'
import { LogViewer } from '@/components/dashboard/LogViewer'
import { Play, Square, RefreshCw, CheckCircle, ChevronDown } from 'lucide-react'

const ALL_ACTIONS = [
  { value: 'start', label: 'Start All' },
  { value: 'stop', label: 'Stop All (except core)' },
  { value: 'restart', label: 'Restart All' },
  { value: 'check', label: 'Check All' },
] as const

export default function StatusPage() {
  const router = useRouter()
  const { services, loading, error, refresh } = useServiceStatus({ interval: 2000 })
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [allActionLoading, setAllActionLoading] = useState<string | null>(null)
  const [selectedAllAction, setSelectedAllAction] = useState<'start' | 'stop' | 'restart' | 'check' | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)

  const healthyCount = services.filter((s: ServiceStatus) =>
    s.health === 'healthy' || s.status === 'running'
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
      refresh()
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
      const promises = services.map((service: ServiceStatus) => {
        if (selectedAllAction === 'stop' && service.id === 'core') {
          return null
        }

        return fetch(`/api/services/${service.id}`, {
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

      refresh()
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
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-6">
            <p className="text-red-400">Failed to load services: {error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {services.map((service: ServiceStatus) => (
            <div
              key={service.id}
              className="bg-gray-800 rounded-lg p-4 hover:bg-gray-750 transition-colors border border-gray-700 hover:border-gray-600"
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('.action-buttons')) return
                router.push(`/services/${service.id}`)
              }}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-white font-semibold">{service.name}</h3>
                  {service.port && (
                    <p className="text-gray-400 text-sm">Port {service.port}</p>
                  )}
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded ${
                  service.health === 'healthy' ? 'bg-green-900/50 text-green-400' :
                  service.health === 'unhealthy' ? 'bg-red-900/50 text-red-400' :
                  'bg-gray-700 text-gray-400'
                }`}>
                  {service.health.toUpperCase()}
                </span>
              </div>

              <div className="flex items-center justify-between text-sm mb-3">
                <div className="flex gap-4 text-gray-400">
                  {service.uptime !== undefined && (
                    <span>Uptime: {formatDuration(service.uptime)}</span>
                  )}
                </div>
              </div>

              <div className="action-buttons flex items-center justify-center gap-2 pt-3 border-t border-gray-700">
                <button
                  onClick={() => handleAction(service.id, 'start')}
                  disabled={actionLoading !== null || service.status === 'running' || service.status === 'starting'}
                  className={`p-2 rounded transition-colors ${
                    service.status === 'running' || service.status === 'starting'
                      ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                      : 'bg-green-900/40 text-green-200 hover:bg-green-600 hover:text-white'
                  }`}
                  title={service.status === 'running' ? 'Already running' : 'Start'}
                >
                  <Play className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleAction(service.id, 'stop')}
                  disabled={actionLoading !== null || service.status === 'stopped'}
                  className={`p-2 rounded transition-colors ${
                    service.status === 'stopped'
                      ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                      : 'bg-red-900/40 text-red-200 hover:bg-red-600 hover:text-white'
                  }`}
                  title={service.status === 'stopped' ? 'Already stopped' : 'Stop'}
                >
                  <Square className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleAction(service.id, 'restart')}
                  disabled={actionLoading !== null}
                  className="p-2 rounded bg-yellow-900/40 text-yellow-200 hover:bg-yellow-600 hover:text-white disabled:bg-gray-600 disabled:cursor-not-allowed disabled:text-gray-500 transition-colors"
                  title="Restart"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleAction(service.id, 'check')}
                  disabled={actionLoading !== null}
                  className="p-2 rounded bg-blue-900/40 text-blue-200 hover:bg-blue-600 hover:text-white disabled:bg-gray-600 disabled:cursor-not-allowed disabled:text-gray-500 transition-colors"
                  title="Check"
                >
                  <CheckCircle className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mb-8">
          <h2 className="text-xl font-semibold text-white mb-4">Live Logs</h2>
          <LogViewer service="all" height="300px" />
        </div>
      </div>
    </div>
  )
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`
}
