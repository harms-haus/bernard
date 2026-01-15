import { handleOkCheck } from '@/lib/api/health-ok'

export async function GET() {
  return handleOkCheck()
}
