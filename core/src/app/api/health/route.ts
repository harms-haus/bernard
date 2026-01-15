import { NextRequest } from 'next/server'
import { handleHealthCheck } from '@/lib/api/health'

export async function GET(request: NextRequest) {
  return handleHealthCheck(request)
}
