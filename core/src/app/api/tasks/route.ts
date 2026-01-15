import { NextRequest } from 'next/server'
import { handleGetTasks, handlePostTaskAction, handleDeleteTask } from '@/lib/api/tasks'

export async function GET(request: NextRequest) {
  return handleGetTasks(request)
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  return handlePostTaskAction(request, body)
}

export async function DELETE(request: NextRequest) {
  return handleDeleteTask(request, request.nextUrl.searchParams)
}
