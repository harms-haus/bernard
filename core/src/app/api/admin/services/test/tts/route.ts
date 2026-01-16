import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/server-helpers'
import { SettingsStore } from '@/lib/config/settingsStore'

const store = new SettingsStore()

export async function POST(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const services = await store.getServices()
  const ttsConfig = services.tts

  if (!ttsConfig?.baseUrl) {
    return NextResponse.json({
      status: 'failed',
      error: 'TTS service is not configured',
      errorType: 'configuration',
      testedAt: new Date().toISOString()
    }, { status: 400 })
  }

  const baseUrl = ttsConfig.baseUrl.replace(/\/$/, '')
  const healthUrl = `${baseUrl}/health`

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }
    if (ttsConfig.apiKey) {
      headers['Authorization'] = `Bearer ${ttsConfig.apiKey}`
    }

    const response = await fetch(healthUrl, { headers })

    if (response.ok || response.status === 404) {
      return NextResponse.json({
        status: 'success',
        message: 'Successfully connected to TTS service',
        testedAt: new Date().toISOString()
      })
    }

    return NextResponse.json({
      status: 'failed',
      error: `TTS service returned error: ${response.status} ${response.statusText}`,
      errorType: 'server_error',
      testedAt: new Date().toISOString()
    }, { status: response.status })
  } catch (error) {
    return NextResponse.json({
      status: 'failed',
      error: `Cannot connect to TTS service: ${error}`,
      errorType: 'connection',
      testedAt: new Date().toISOString()
    }, { status: 500 })
  }
}
