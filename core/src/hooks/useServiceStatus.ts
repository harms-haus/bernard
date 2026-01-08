'use client'

import { useEffect, useState, useCallback } from 'react'

export interface ServiceStatus {
  id: string
  name: string
  port?: number
  status: 'running' | 'stopped' | 'starting' | 'failed'
  uptime?: number
  lastStarted?: Date
  lastStopped?: Date
  health: 'healthy' | 'unhealthy' | 'unknown'
  color: string
}

export interface UseServiceStatusOptions {
  refreshInterval?: number
  enabled?: boolean
}

export function useServiceStatus(options: UseServiceStatusOptions = {}) {
  const { refreshInterval = 3000, enabled = true } = options
  const [statuses, setStatuses] = useState<ServiceStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStatuses = useCallback(async () => {
    try {
      const response = await fetch('/api/services')
      if (!response.ok) {
        throw new Error('Failed to fetch service statuses')
      }
      const data = await response.json()
      setStatuses(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return

    fetchStatuses()
    const interval = setInterval(fetchStatuses, refreshInterval)
    return () => clearInterval(interval)
  }, [enabled, refreshInterval, fetchStatuses])

  const refresh = useCallback(() => {
    setLoading(true)
    fetchStatuses()
  }, [fetchStatuses])

  return {
    statuses,
    loading,
    error,
    refresh,
  }
}

export function useService(serviceId: string, options: UseServiceStatusOptions = {}) {
  const { refreshInterval = 3000, enabled = true } = options
  const [status, setStatus] = useState<ServiceStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch(`/api/services?service=${serviceId}`)
      if (!response.ok) {
        throw new Error('Failed to fetch service status')
      }
      const data = await response.json()
      setStatus(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [serviceId])

  useEffect(() => {
    if (!enabled) return

    fetchStatus()
    const interval = setInterval(fetchStatus, refreshInterval)
    return () => clearInterval(interval)
  }, [enabled, refreshInterval, serviceId, fetchStatus])

  return {
    status,
    loading,
    error,
    refresh: fetchStatus,
  }
}
