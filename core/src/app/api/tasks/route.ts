import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/helpers';
import { logger } from '@/lib/logging/logger';
import { TaskRecordKeeper, type TaskListQuery } from '@/lib/infra';
import { getRedis } from '@/lib/infra';

function getTaskKeeper() {
  return new TaskRecordKeeper(getRedis());
}

export async function GET(request: NextRequest) {
  try {
    const authUser = await requireAuth(request);
    if (authUser instanceof NextResponse) return authUser;

    const userId = authUser.user.id;
    const searchParams = request.nextUrl.searchParams;
    const includeArchived = searchParams.get('includeArchived') === 'true';
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 50;
    const offset = searchParams.get('offset') ? Number(searchParams.get('offset')) : 0;

    const keeper = getTaskKeeper();
    const query: TaskListQuery = {
      userId,
      includeArchived,
      limit,
      offset
    };
    const result = await keeper.listTasks(query);

    return NextResponse.json(result);
  } catch (error) {
    logger.error({ error }, 'Failed to list tasks');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await requireAuth(request);
    if (authUser instanceof NextResponse) return authUser;

    const userId = authUser.user.id;
    const body = await request.json() as { action: string; taskId: string };
    const { action, taskId } = body;

    if (!taskId || !action) {
      return NextResponse.json({ error: 'taskId and action are required' }, { status: 400 });
    }

    const keeper = getTaskKeeper();

    switch (action) {
      case 'cancel': {
        const task = await keeper.getTask(taskId);
        if (!task) {
          return NextResponse.json({ error: 'Task not found' }, { status: 404 });
        }
        if (task.userId !== userId) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        const success = await keeper.cancelTask(taskId);
        if (!success) {
          return NextResponse.json({ error: 'Cannot cancel task' }, { status: 400 });
        }
        return NextResponse.json({ success: true });
      }
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    logger.error({ error }, 'Failed to perform task action');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authUser = await requireAuth(request);
    if (authUser instanceof NextResponse) return authUser;

    const userId = authUser.user.id;
    const searchParams = request.nextUrl.searchParams;
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
    }

    const keeper = getTaskKeeper();
    const task = await keeper.getTask(taskId);

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    if (task.userId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const success = await keeper.deleteTask(taskId);
    if (!success) {
      return NextResponse.json({ error: 'Cannot delete task' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Failed to delete task');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
