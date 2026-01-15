import { NextRequest } from 'next/server'
import { handleMe } from '@/lib/api/auth-me'

export async function GET(request: NextRequest) {
  return handleMe(request)
}
