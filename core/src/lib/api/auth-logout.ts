import { NextResponse } from 'next/server'
import { error, ok } from './response'
import { clearSessionCookie } from '../auth/session'

export async function handleLogout(): Promise<NextResponse> {
  try {
    await clearSessionCookie()
    return ok({ success: true })
  } catch {
    return error('Failed to logout', 500)
  }
}
