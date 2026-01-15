import { NextRequest } from 'next/server'
import { handleGetServices } from '@/lib/api/services'

export async function GET(request: NextRequest) {
  return handleGetServices(request)
}
