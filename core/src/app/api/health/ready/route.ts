import { handleReadyCheck } from '@/lib/api/health-ready'

export async function GET() {
  return handleReadyCheck()
}
