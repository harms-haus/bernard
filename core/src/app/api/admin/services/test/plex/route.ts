import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/server-helpers'
import { SettingsStore } from '@/lib/config/settingsStore'

const store = new SettingsStore()

export async function POST(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const services = await store.getServices()
  const plexConfig = services.plex

  if (!plexConfig?.baseUrl) {
    return NextResponse.json({
      status: 'failed',
      error: 'Plex is not configured',
      errorType: 'configuration',
      testedAt: new Date().toISOString()
    }, { status: 400 })
  }

  if (!plexConfig.token) {
    return NextResponse.json({
      status: 'failed',
      error: 'Plex token is not configured',
      errorType: 'configuration',
      testedAt: new Date().toISOString()
    }, { status: 400 })
  }

  const baseUrl = plexConfig.baseUrl.replace(/\/$/, '')
  const identityUrl = `${baseUrl}/identity`

  try {
    const response = await fetch(identityUrl, {
      headers: {
        'X-Plex-Token': plexConfig.token
      }
    })

    if (response.ok) {
      // Plex returns XML, try to parse machineIdentifier
      const text = await response.text()
      const machineIdMatch = text.match(/machineIdentifier="([^"]+)"/)
      const machineIdentifier = machineIdMatch ? machineIdMatch[1] : undefined

      return NextResponse.json({
        status: 'success',
        message: 'Successfully connected to Plex Media Server',
        machineIdentifier,
        testedAt: new Date().toISOString()
      })
    }

    return NextResponse.json({
      status: 'failed',
      error: `Plex returned error: ${response.status} ${response.statusText}`,
      errorType: 'server_error',
      testedAt: new Date().toISOString()
    }, { status: response.status })
  } catch (error) {
    return NextResponse.json({
      status: 'failed',
      error: `Cannot connect to Plex: ${error}`,
      errorType: 'connection',
      testedAt: new Date().toISOString()
    }, { status: 500 })
  }
}
