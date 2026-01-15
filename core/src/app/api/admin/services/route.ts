import { NextRequest } from 'next/server'
import { handleListServices, handleManageService } from '@/lib/api/admin-services'

export async function GET(request: NextRequest) {
  return handleListServices(request)
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  return handleManageService(request, body)
}
