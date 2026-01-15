import { NextRequest } from 'next/server'
import { handleGetServicesSettings, handlePutServicesSettings } from '@/lib/api/settings-services'

export async function GET(request: NextRequest) {
  return handleGetServicesSettings(request)
}

export async function PUT(request: NextRequest) {
  return handlePutServicesSettings(request)
}
