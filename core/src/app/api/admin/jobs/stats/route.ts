import { requireAdmin } from '@/lib/auth/server-helpers';
import { NextResponse } from 'next/server';
import { getQueueStats } from '@/lib/infra/worker-queue';

/**
 * GET /api/admin/jobs/stats
 *
 * Get queue statistics including counts by status.
 * Requires admin role.
 */
export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const stats = await getQueueStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error('[JobsAPI] Failed to get queue stats:', error);
    return NextResponse.json(
      { error: 'Failed to get stats' },
      { status: 500 }
    );
  }
}
