import { requireAdmin } from '@/lib/auth/server-helpers';
import { NextRequest, NextResponse } from 'next/server';
import { listJobs, getQueueStats } from '@/lib/infra/worker-queue';
import type { ListJobsOptions } from '@/lib/infra/worker-queue';

/**
 * GET /api/admin/jobs
 *
 * List jobs with optional filters and include queue statistics.
 * Requires admin role.
 */
export async function GET(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);

  // Parse filter options
  const options: ListJobsOptions = {
    status: searchParams.get('status')?.split(',') as any,
    type: searchParams.get('type')?.split(',') as any,
    limit: parseInt(searchParams.get('limit') || '50'),
    offset: parseInt(searchParams.get('offset') || '0'),
  };

  try {
    const [jobs, stats] = await Promise.all([
      listJobs(options),
      getQueueStats(),
    ]);

    return NextResponse.json({ jobs, stats });
  } catch (error) {
    console.error('[JobsAPI] Failed to list jobs:', error);
    return NextResponse.json(
      { error: 'Failed to list jobs', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
