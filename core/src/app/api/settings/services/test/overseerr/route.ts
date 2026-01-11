import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin as requireAdminAuth } from '@/lib/auth/helpers'
import { SettingsStore } from '@/lib/config/settingsStore'

export async function POST(request: NextRequest) {
  const admin = await requireAdminAuth(request)
  if (admin instanceof NextResponse) return admin

  const store = new SettingsStore()
  const services = await store.getServices()
  const overseerrConfig = services.overseerr

  if (!overseerrConfig?.baseUrl) {
    return NextResponse.json({
      status: 'failed',
      error: 'Overseerr is not configured',
      errorType: 'configuration',
      testedAt: new Date().toISOString()
    }, { status: 400 })
  }

  if (!overseerrConfig.apiKey) {
    return NextResponse.json({
      status: 'failed',
      error: 'Overseerr API key is not configured',
      errorType: 'configuration',
      testedAt: new Date().toISOString()
    }, { status: 400 })
  }

  const baseUrl = overseerrConfig.baseUrl.replace(/\/$/, '')
  const searchUrl = `${baseUrl}/search?query=test&page=1`

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

    const response = await fetch(searchUrl, {
      headers: {
        'X-Api-Key': overseerrConfig.apiKey,
        'Content-Type': 'application/json'
      },
      signal: controller.signal
    })

    clearTimeout(timeoutId)

    if (response.ok) {
      return NextResponse.json({
        status: 'success',
        message: 'Successfully connected to Overseerr',
        testedAt: new Date().toISOString()
      })
    }

    if (response.status === 401 || response.status === 403) {
      return NextResponse.json({
        status: 'failed',
        error: 'Invalid Overseerr API key',
        errorType: 'unauthorized',
        testedAt: new Date().toISOString()
      }, { status: response.status })
    }

    return NextResponse.json({
      status: 'failed',
      error: `Overseerr returned error: ${response.status} ${response.statusText}`,
      errorType: 'server_error',
      testedAt: new Date().toISOString()
    }, { status: response.status })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json({
        status: 'failed',
        error: 'Connection to Overseerr timed out',
        errorType: 'timeout',
        testedAt: new Date().toISOString()
      }, { status: 408 })
    }

    return NextResponse.json({
      status: 'failed',
      error: `Cannot connect to Overseerr: ${error}`,
      errorType: 'connection',
      testedAt: new Date().toISOString()
    }, { status: 500 })
  }
}
