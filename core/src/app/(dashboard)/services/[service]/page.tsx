'use client'

import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useService } from '@/hooks/useServiceStatus'
import { LogViewer } from '@/components/dashboard/LogViewer'

export default function ServicePage() {
  const router = useRouter()
  const params = useParams()
  const serviceId = params.service as string
  const { status, loading, error, refresh } = useService(serviceId)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const handleAction = async (action: 'start' | 'stop' | 'restart' | 'check') => {
    setActionLoading(action)
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

  if (loading && !status) {
    return (
      <div className="min-h-screen bg-gray-900 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-700 rounded w-1/4 mb-4"></div>
            <div className="h-4 bg-gray-700 rounded w-1/2 mb-8"></div>
            <div className="h-32 bg-gray-800 rounded-lg"></div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !status) {
    return (
      <div className="min-h-screen bg-gray-900 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-8 text-center">
            <p className="text-red-400 mb-4">Service not found or failed to load</p>
            <button
              onClick={() => router.push('/status')}
              className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg"
            >
              Back to Status
            </button>
          </div>
        </div>
      </div>
    )
  }

  const statusColors: Record<string, string> = {
    running: 'bg-green-500',
    stopped: 'bg-gray-500',
    starting: 'bg-yellow-500',
    failed: 'bg-red-500',
  }

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        <button
          onClick={() => router.push('/status')}
          className="text-gray-400 hover:text-white mb-4 flex items-center gap-2"
        >
          ← Back to Status
        </button>

        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">{status.name}</h1>
            {status.port && (
              <p className="text-gray-400 mt-1">Port {status.port}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded text-sm font-medium ${
              status.status === 'running' ? 'bg-green-900/50 text-green-400' :
              status.status === 'stopped' ? 'bg-gray-700 text-gray-400' :
              status.status === 'starting' ? 'bg-yellow-900/50 text-yellow-400' :
              'bg-red-900/50 text-red-400'
            }`}>
              {status.status.toUpperCase()}
            </span>
            <span className={`px-3 py-1 rounded text-sm font-medium ${
              status.health === 'healthy' ? 'bg-green-900/50 text-green-400' :
              status.health === 'unhealthy' ? 'bg-red-900/50 text-red-400' :
              'bg-gray-700 text-gray-400'
            }`}>
              {status.health.toUpperCase()}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-gray-400 text-sm mb-2">Status</h3>
            <div className="flex items-center gap-3">
              <div className={`w-4 h-4 rounded-full ${statusColors[status.status]} ${
                status.status === 'running' ? 'animate-pulse' : ''
              }`} />
              <span className="text-white font-medium capitalize">{status.status}</span>
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-gray-400 text-sm mb-2">Health</h3>
            <span className={`text-white font-medium capitalize ${
              status.health === 'healthy' ? 'text-green-400' :
              status.health === 'unhealthy' ? 'text-red-400' :
              'text-gray-400'
            }`}>
              {status.health}
            </span>
          </div>

          <div className="bg-gray-800 rounded-lg p-6">
            <h3 className="text-gray-400 text-sm mb-2">Uptime</h3>
            <span className="text-white font-medium">
              {status.uptime !== undefined ? formatDuration(status.uptime) : 'N/A'}
            </span>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 mb-8">
          <h3 className="text-white font-semibold mb-4">Actions</h3>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => handleAction('start')}
              disabled={actionLoading !== null || status.status === 'running'}
              className="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              {actionLoading === 'start' ? 'Starting...' : 'Start'}
            </button>
            <button
              onClick={() => handleAction('stop')}
              disabled={actionLoading !== null || status.status === 'stopped'}
              className="px-4 py-2 bg-red-700 hover:bg-red-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              {actionLoading === 'stop' ? 'Stopping...' : 'Stop'}
            </button>
            <button
              onClick={() => handleAction('restart')}
              disabled={actionLoading !== null}
              className="px-4 py-2 bg-yellow-700 hover:bg-yellow-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              {actionLoading === 'restart' ? 'Restarting...' : 'Restart'}
            </button>
            <button
              onClick={() => handleAction('check')}
              disabled={actionLoading !== null}
              className="px-4 py-2 bg-blue-700 hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              {actionLoading === 'check' ? 'Checking...' : 'Check'}
            </button>
            <button
              onClick={refresh}
              disabled={actionLoading !== null}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>

        <div>
          <h3 className="text-white font-semibold mb-4">Live Logs</h3>
          <LogViewer service={serviceId} height="400px" />
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
