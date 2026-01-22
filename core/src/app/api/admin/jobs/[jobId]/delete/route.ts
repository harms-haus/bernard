import { requireAdmin } from '@/lib/auth/server-helpers';
import { NextRequest, NextResponse } from 'next/server';
import { deleteJob } from '@/lib/infra/worker-queue';

/**
 * DELETE /api/admin/jobs/[jobId]/delete
 *
 * Delete a job from the queue and history.
 * Only works on non-running jobs (completed, queued, errored, cancelled).
 * Requires admin role.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { jobId } = await params;

  try {
    const success = await deleteJob(jobId);

    if (!success) {
      return NextResponse.json(
        { error: 'Cannot delete job - job may be running or not found' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[JobsAPI] Failed to delete job:', error);
    return NextResponse.json(
      { error: 'Failed to delete job', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
