import { requireAdmin } from '@/lib/auth/server-helpers';
import { NextRequest, NextResponse } from 'next/server';
import { getJobHistory } from '@/lib/infra/worker-queue';

/**
 * GET /api/admin/jobs/[jobId]
 *
 * Get detailed information about a specific job.
 * Requires admin role.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { jobId } = await params;

  try {
    const job = await getJobHistory(jobId);

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json(job);
  } catch (error) {
    console.error('[JobsAPI] Failed to get job history:', error);
    return NextResponse.json(
      { error: 'Failed to get job', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
