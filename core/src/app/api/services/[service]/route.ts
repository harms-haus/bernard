import { NextRequest } from 'next/server'
import { handleGetService, handleServiceCommand } from '@/lib/api/services-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ service: string }> }
) {
  const { service } = await params
  return handleGetService(service)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ service: string }> }
) {
  const { service } = await params
  const body = await request.json().catch(() => ({}))
  return handleServiceCommand(service, body)
}
