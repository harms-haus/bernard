import { NextRequest, NextResponse } from 'next/server'
import { error, ok } from '../../../../lib/api/response'
import { clearSessionCookie } from '../../../../lib/auth/session'

async function handleLogout(): Promise<NextResponse> {
  try {
    await clearSessionCookie()
    return ok({ success: true })
  } catch {
    return error('Failed to logout', 500)
  }
}

export async function POST(_request: NextRequest) {
  return handleLogout()
}
