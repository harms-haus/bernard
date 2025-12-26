import { TaskRecordKeeper } from "../../agent/recordKeeper/task.keeper";
import { getRedis } from "../infra/redis";
import { childLogger, logger } from "../logging";

const log = childLogger({ component: "task_archiver" }, logger);

function getArchiveConfig() {
  return {
    archiveAfterDays: parseInt(process.env["TASK_ARCHIVE_AFTER_DAYS"] ?? "7", 10) || 7,
    batchSize: parseInt(process.env["TASK_ARCHIVE_BATCH_SIZE"] ?? "100", 10) || 100
  };
}

/**
 * TaskArchiver handles automatic archiving of completed tasks after a specified period
 */
export class TaskArchiver {
  private recordKeeper: TaskRecordKeeper;

  constructor(recordKeeper?: TaskRecordKeeper) {
    this.recordKeeper = recordKeeper || new TaskRecordKeeper(getRedis());
  }

  /**
   * Archive tasks that are older than the threshold and completed
   */
  async archiveOldTasks(): Promise<{ archived: number; errors: number }> {
    const config = getArchiveConfig();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - config.archiveAfterDays);

    log.info({
      event: "archive_old_tasks.start",
      cutoffDate: cutoffDate.toISOString(),
      archiveAfterDays: config.archiveAfterDays
    });

    let archived = 0;
    let errors = 0;
    let hasMore = true;
    let offset = 0;

    while (hasMore) {
      try {
        // Get a batch of completed tasks
        const completedTasks = await this.recordKeeper.getRedisClient().zrange(
          "bernard:task:rk:tasks:completed",
          offset,
          offset + config.batchSize - 1,
          "WITHSCORES"
        );

        if (completedTasks.length === 0) {
          hasMore = false;
          break;
        }

        // Process each task in the batch
        for (let i = 0; i < completedTasks.length; i += 2) {
          const taskId = completedTasks[i];
          const timestampStr = completedTasks[i + 1];

          if (!taskId || !timestampStr) continue;

          const timestamp = Number(timestampStr);

          // Check if task is old enough to archive
          const taskDate = new Date(timestamp);
          if (taskDate < cutoffDate) {
            try {
              const success = await this.recordKeeper.archiveTask(taskId);
              if (success) {
                archived++;
                log.debug({
                  event: "task.archived",
                  taskId,
                  taskDate: taskDate.toISOString()
                });
              }
            } catch (error) {
              errors++;
              log.error({
                event: "task.archive_error",
                taskId,
                error: error instanceof Error ? error.message : String(error)
              });
            }
          }
        }

        offset += config.batchSize;

        // Safety check to prevent infinite loops
        if (offset > 10000) {
          log.warn({
            event: "archive_old_tasks.safety_limit",
            offset,
            archived,
            errors
          });
          break;
        }

      } catch (error) {
        errors++;
        log.error({
          event: "archive_batch_error",
          offset,
          error: error instanceof Error ? error.message : String(error)
        });
        break;
      }
    }

    log.info({
      event: "archive_old_tasks.complete",
      archived,
      errors,
      cutoffDate: cutoffDate.toISOString()
    });

    return { archived, errors };
  }

  /**
   * Clean up archived tasks that are very old (optional cleanup)
   * This permanently deletes archived tasks after an extended period
   */
  async cleanupArchivedTasks(daysOld: number = 90): Promise<{ deleted: number; errors: number }> {
    const config = getArchiveConfig();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    log.info({
      event: "cleanup_archived_tasks.start",
      cutoffDate: cutoffDate.toISOString(),
      daysOld
    });

    let deleted = 0;
    let errors = 0;
    let hasMore = true;
    let offset = 0;

    while (hasMore) {
      try {
        // Get a batch of archived tasks
        const archivedTasks = await this.recordKeeper.getRedisClient().zrange(
          "bernard:task:rk:tasks:archived",
          offset,
          offset + config.batchSize - 1,
          "WITHSCORES"
        );

        if (archivedTasks.length === 0) {
          hasMore = false;
          break;
        }

        // Process each task in the batch
        for (let i = 0; i < archivedTasks.length; i += 2) {
          const taskId = archivedTasks[i];
          const timestampStr = archivedTasks[i + 1];

          if (!taskId || !timestampStr) continue;

          const timestamp = Number(timestampStr);

          // Check if task is old enough to delete
          const taskDate = new Date(timestamp);
          if (taskDate < cutoffDate) {
            try {
              const success = await this.recordKeeper.deleteTask(taskId);
              if (success) {
                deleted++;
                log.debug({
                  event: "archived_task.deleted",
                  taskId,
                  taskDate: taskDate.toISOString()
                });
              }
            } catch (error) {
              errors++;
              log.error({
                event: "archived_task.delete_error",
                taskId,
                error: error instanceof Error ? error.message : String(error)
              });
            }
          }
        }

        offset += config.batchSize;

        // Safety check to prevent infinite loops
        if (offset > 10000) {
          log.warn({
            event: "cleanup_archived_tasks.safety_limit",
            offset,
            deleted,
            errors
          });
          break;
        }

      } catch (error) {
        errors++;
        log.error({
          event: "cleanup_batch_error",
          offset,
          error: error instanceof Error ? error.message : String(error)
        });
        break;
      }
    }

    log.info({
      event: "cleanup_archived_tasks.complete",
      deleted,
      errors,
      cutoffDate: cutoffDate.toISOString()
    });

    return { deleted, errors };
  }

  /**
   * Get archiving statistics
   */
  async getStats(): Promise<{
    active: number;
    completed: number;
    archived: number;
    total: number;
  }> {
    const redis = this.recordKeeper.getRedisClient();

    const [active, completed, archived] = await Promise.all([
      redis.zcard("bernard:task:rk:tasks:active"),
      redis.zcard("bernard:task:rk:tasks:completed"),
      redis.zcard("bernard:task:rk:tasks:archived")
    ]);

    return {
      active: Number(active) || 0,
      completed: Number(completed) || 0,
      archived: Number(archived) || 0,
      total: (Number(active) || 0) + (Number(completed) || 0) + (Number(archived) || 0)
    };
  }
}

/**
 * Convenience function to run archiving job
 */
export async function runTaskArchiving(): Promise<{ archived: number; errors: number }> {
  const archiver = new TaskArchiver();
  return archiver.archiveOldTasks();
}

/**
 * Convenience function to run cleanup job
 */
export async function runArchivedTaskCleanup(daysOld: number = 90): Promise<{ deleted: number; errors: number }> {
  const archiver = new TaskArchiver();
  return archiver.cleanupArchivedTasks(daysOld);
}
