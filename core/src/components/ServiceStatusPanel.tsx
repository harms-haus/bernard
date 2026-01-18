"use client"

import { useState } from 'react'
import { useHealthStream, type HealthStreamUpdate } from '@/hooks/useHealthStream'
import { LogViewer } from '@/components/dashboard/LogViewer'
import { Play, Square, RefreshCw, CheckCircle, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const ALL_ACTIONS = [
  { value: 'start', label: 'Start All' },
  { value: 'stop', label: 'Stop All (except core)' },
  { value: 'restart', label: 'Restart All' },
  { value: 'check', label: 'Check All' },
] as const

interface ServiceStatusPanelProps {
  title?: string
  showLogs?: boolean
  className?: string
}

export function ServiceStatusPanel({
  title = 'Service Status',
  showLogs = true,
  className = ''
}: ServiceStatusPanelProps) {
  const { serviceList, error, refresh } = useHealthStream({ enabled: true })
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [allActionLoading, setAllActionLoading] = useState<string | null>(null)
  const [selectedAllAction, setSelectedAllAction] = useState<'start' | 'stop' | 'restart' | 'check' | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)

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
    } catch (err) {
      alert(`Error: ${err}`)
    } finally {
      setAllActionLoading(null)
      setSelectedAllAction(null)
    }
  }

  const allActions = ALL_ACTIONS

  const getStatusBadgeStyles = (status: string) => {
    switch (status) {
      case 'up':
        return 'bg-green-500/10 text-green-500 border-green-500/20'
      case 'down':
        return 'bg-red-500/10 text-red-500 border-red-500/20'
      case 'starting':
        return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
      default:
        return 'bg-muted text-muted-foreground'
    }
  }

  return (
    <div className={cn('space-y-6', className)}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{title}</h1>
          <p className="text-muted-foreground mt-1">
            {healthyCount}/{totalCount} services healthy
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Button
              variant="outline"
              onClick={() => setShowDropdown(!showDropdown)}
              className="min-w-[160px] justify-between"
            >
              <span>{selectedAllAction ? allActions.find(a => a.value === selectedAllAction)?.label : 'Select Action'}</span>
              <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
            </Button>
            {showDropdown && (
              <div className="absolute right-0 top-full mt-2 z-50 w-[200px] rounded-md border bg-card shadow-lg">
                {allActions.map((action) => (
                  <button
                    key={action.value}
                    onClick={() => {
                      setSelectedAllAction(action.value)
                      setShowDropdown(false)
                    }}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-muted first:rounded-t-md last:rounded-b-md"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button
            onClick={handleAllAction}
            disabled={!selectedAllAction || allActionLoading !== null}
          >
            {allActionLoading === 'start' ? 'Starting...' :
             allActionLoading === 'stop' ? 'Stopping...' :
             allActionLoading === 'restart' ? 'Restarting...' :
             allActionLoading === 'check' ? 'Checking...' : 'Execute'}
          </Button>
          <Button
            variant="outline"
            onClick={refresh}
          >
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">Failed to load services: {error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {services.map((service: HealthStreamUpdate) => (
          <Card
            key={service.service}
            className={cn(
              'transition-colors hover:bg-muted/50',
              !(service.status === 'up') && 'border-amber-500/30 dark:border-amber-500/30'
            )}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold">{service.name}</h3>
                </div>
                <span className={cn(
                  'text-xs font-medium px-2 py-1 rounded border',
                  getStatusBadgeStyles(service.status)
                )}>
                  {service.status.toUpperCase()}
                </span>
              </div>

              <div className="flex items-center justify-between text-sm mb-3">
                <div className="flex gap-4 text-muted-foreground">
                  {service.responseTime !== undefined && (
                    <span>Response: {service.responseTime}ms</span>
                  )}
                </div>
              </div>

              <div className="action-buttons flex items-center justify-center gap-2 pt-3 border-t mt-3">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleAction(service.service, 'start')}
                  disabled={actionLoading !== null || service.status === 'up'}
                  className={cn(
                    'h-8 w-8',
                    service.status === 'up'
                      ? 'text-muted-foreground cursor-not-allowed'
                      : 'text-green-500 hover:bg-green-500/10 hover:text-green-600'
                  )}
                  title={service.status === 'up' ? 'Already running' : 'Start'}
                >
                  <Play className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleAction(service.service, 'stop')}
                  disabled={actionLoading !== null || service.status === 'down'}
                  className={cn(
                    'h-8 w-8',
                    service.status === 'down'
                      ? 'text-muted-foreground cursor-not-allowed'
                      : 'text-red-500 hover:bg-red-500/10 hover:text-red-600'
                  )}
                  title={service.status === 'down' ? 'Already stopped' : 'Stop'}
                >
                  <Square className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleAction(service.service, 'restart')}
                  disabled={actionLoading !== null}
                  className="h-8 w-8 text-amber-500 hover:bg-amber-500/10 hover:text-amber-600 disabled:text-muted-foreground"
                  title="Restart"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleAction(service.service, 'check')}
                  disabled={actionLoading !== null}
                  className="h-8 w-8 text-blue-500 hover:bg-blue-500/10 hover:text-blue-600 disabled:text-muted-foreground"
                  title="Check"
                >
                  <CheckCircle className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {showLogs && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Live Logs</h2>
          <LogViewer service="all" height="300px" />
        </div>
      )}
    </div>
  )
}
