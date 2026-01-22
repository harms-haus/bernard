import { requireAdmin } from '@/lib/auth/server-helpers';
import { NextRequest, NextResponse } from 'next/server';
import { cancelJob } from '@/lib/infra/worker-queue';

/**
 * POST /api/admin/jobs/[jobId]/cancel
 *
 * Cancel a running or queued job.
 * Only works on jobs that are currently active or waiting.
 * Requires admin role.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { jobId } = await params;

  try {
    const success = await cancelJob(jobId);

    if (!success) {
      return NextResponse.json(
        { error: 'Cannot cancel job - job may not be in a cancellable state (only active/waiting jobs can be cancelled)' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[JobsAPI] Failed to cancel job:', error);
    return NextResponse.json(
      { error: 'Failed to cancel job', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
