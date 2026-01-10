import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin as requireAdminAuth } from '@/lib/auth/helpers'
import { SettingsStore } from '@/lib/config/settingsStore'

const store = new SettingsStore()

export async function POST(request: NextRequest) {
  const admin = await requireAdminAuth(request)
  if (admin instanceof NextResponse) return admin

  const services = await store.getServices()
  const haConfig = services.homeAssistant

  if (!haConfig?.baseUrl) {
    return NextResponse.json({
      status: 'failed',
      error: 'Home Assistant is not configured',
      errorType: 'configuration',
      testedAt: new Date().toISOString()
    }, { status: 400 })
  }

  if (!haConfig.accessToken) {
    return NextResponse.json({
      status: 'failed',
      error: 'Access token is not configured',
      errorType: 'configuration',
      testedAt: new Date().toISOString()
    }, { status: 400 })
  }

  const baseUrl = haConfig.baseUrl.replace(/\/$/, '')
  const apiUrl = `${baseUrl}/api/`

  try {
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${haConfig.accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (response.ok) {
      return NextResponse.json({
        status: 'success',
        message: 'Successfully connected to Home Assistant',
        testedAt: new Date().toISOString()
      })
    }

    return NextResponse.json({
      status: 'failed',
      error: `Home Assistant returned error: ${response.status} ${response.statusText}`,
      errorType: 'server_error',
      testedAt: new Date().toISOString()
    }, { status: response.status })
  } catch (error) {
    return NextResponse.json({
      status: 'failed',
      error: `Cannot connect to Home Assistant: ${error}`,
      errorType: 'connection',
      testedAt: new Date().toISOString()
    }, { status: 500 })
  }
}
