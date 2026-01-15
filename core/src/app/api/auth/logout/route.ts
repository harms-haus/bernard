import { NextRequest } from 'next/server'
import { handleLogout } from '@/lib/api/auth-logout'

export async function POST(_request: NextRequest) {
  return handleLogout()
}
