import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/server-helpers'
import { getSettingsStore, initializeSettingsStore } from '@/lib/config/settingsStore'
import { getRedis } from '@/lib/infra/redis'

let initialized = false;

async function getStore() {
  if (!initialized) {
    await initializeSettingsStore(undefined, getRedis());
    initialized = true;
  }
  return getSettingsStore();
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const store = await getStore()
  const services = await store.getServices()
  const sttConfig = services.stt

  if (!sttConfig?.baseUrl) {
    return NextResponse.json({
      status: 'failed',
      error: 'STT service is not configured',
      errorType: 'configuration',
      testedAt: new Date().toISOString()
    }, { status: 400 })
  }

  const baseUrl = sttConfig.baseUrl.replace(/\/$/, '')
  const healthUrl = `${baseUrl}/health`

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }
    if (sttConfig.apiKey) {
      headers['Authorization'] = `Bearer ${sttConfig.apiKey}`
    }

    const response = await fetch(healthUrl, { headers })

    if (response.ok || response.status === 404) {
      return NextResponse.json({
        status: 'success',
        message: 'Successfully connected to STT service',
        testedAt: new Date().toISOString()
      })
    }

    return NextResponse.json({
      status: 'failed',
      error: `STT service returned error: ${response.status} ${response.statusText}`,
      errorType: 'server_error',
      testedAt: new Date().toISOString()
    }, { status: response.status })
  } catch (error) {
    return NextResponse.json({
      status: 'failed',
      error: `Cannot connect to STT service: ${error}`,
      errorType: 'connection',
      testedAt: new Date().toISOString()
    }, { status: 500 })
  }
}
