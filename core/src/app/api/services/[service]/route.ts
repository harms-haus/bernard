import { NextRequest } from 'next/server'
import { handleGetService, handleServiceCommand } from '@/lib/api/services-dynamic'
import { requireAuth } from '@/lib/auth/server-helpers'
import { error } from '@/lib/api/response'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ service: string }> }
) {
  const session = await requireAuth()
  if (!session) return error("Session required", 401)
  const { service } = await params
  return handleGetService(service)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ service: string }> }
) {
  const session = await requireAuth()
  if (!session) return error("Session required", 401)
  const { service } = await params
  const body = await request.json().catch(() => ({}))
  return handleServiceCommand(service, body)
}
