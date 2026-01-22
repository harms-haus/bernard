import { requireAdmin } from '@/lib/auth/server-helpers';
import { NextRequest, NextResponse } from 'next/server';
import { rerunJob } from '@/lib/infra/worker-queue';

/**
 * POST /api/admin/jobs/[jobId]/rerun
 *
 * Rerun a job by creating a copy with the same data.
 * The original job is preserved.
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
    const newJobId = await rerunJob(jobId);

    if (!newJobId) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json({ newJobId });
  } catch (error) {
    console.error('[JobsAPI] Failed to rerun job:', error);
    return NextResponse.json(
      { error: 'Failed to rerun job', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
