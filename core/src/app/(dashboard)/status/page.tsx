'use client'

import { useRouter } from 'next/navigation'
import { useServiceStatus } from '@/hooks/useServiceStatus'
import { LogViewer } from '@/components/dashboard/LogViewer'

export default function StatusPage() {
  const router = useRouter()
  const { statuses, loading, error, refresh } = useServiceStatus({ refreshInterval: 2000 })

  if (loading && statuses.length === 0) {
    return (
      <div className="min-h-screen bg-gray-900 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-2xl font-bold text-white">Service Status</h1>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-gray-800 rounded-lg p-4 animate-pulse">
                <div className="h-6 bg-gray-700 rounded w-1/3 mb-4"></div>
                <div className="h-4 bg-gray-700 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const runningCount = statuses.filter((s) => s.status === 'running').length
  const totalCount = statuses.length

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Service Status</h1>
            <p className="text-gray-400 mt-1">
              {runningCount}/{totalCount} services running
            </p>
          </div>
          <div className="flex items-center gap-3">
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {statuses.map((service) => (
            <div
              key={service.id}
              className="bg-gray-800 rounded-lg p-4 hover:bg-gray-750 transition-colors cursor-pointer border border-gray-700 hover:border-gray-600"
              onClick={() => router.push(`/services/${service.id}`)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      service.status === 'running' ? 'bg-green-500 animate-pulse' :
                      service.status === 'stopped' ? 'bg-gray-500' :
                      service.status === 'starting' ? 'bg-yellow-500 animate-pulse' :
                      'bg-red-500'
                    }`}
                  />
                  <div>
                    <h3 className="text-white font-semibold">{service.name}</h3>
                    {service.port && (
                      <p className="text-gray-400 text-sm">Port {service.port}</p>
                    )}
                  </div>
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded ${
                  service.health === 'healthy' ? 'bg-green-900/50 text-green-400' :
                  service.health === 'unhealthy' ? 'bg-red-900/50 text-red-400' :
                  'bg-gray-700 text-gray-400'
                }`}>
                  {service.health.toUpperCase()}
                </span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <div className="flex gap-4 text-gray-400">
                  {service.uptime !== undefined && (
                    <span>Uptime: {formatDuration(service.uptime)}</span>
                  )}
                </div>
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  service.status === 'running' ? 'bg-green-900/50 text-green-400' :
                  service.status === 'stopped' ? 'bg-gray-700 text-gray-400' :
                  service.status === 'starting' ? 'bg-yellow-900/50 text-yellow-400' :
                  'bg-red-900/50 text-red-400'
                }`}>
                  {service.status.toUpperCase()}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="mb-8">
          <h2 className="text-xl font-semibold text-white mb-4">Live Logs</h2>
          <LogViewer service="all" maxHeight="300px" />
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
