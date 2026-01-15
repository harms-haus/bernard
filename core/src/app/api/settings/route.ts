import { NextRequest } from 'next/server'
import { handleGetSettings } from '@/lib/api/settings'

export async function GET(request: NextRequest) {
  return handleGetSettings(request)
}
