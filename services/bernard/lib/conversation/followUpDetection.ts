/**
 * Check if a message is a follow-up suggestion task from OpenWebUI or similar systems.
 *
 * Detection strategy:
 * 1. Check metadata for official identifier (e.g., metadata.followUpTask === true)
 * 2. Check message name for identifier (e.g., name === "followup_task")
 */
export function isFollowUpSuggestionMessage(
  message: { metadata?: Record<string, unknown> | undefined; name?: string | undefined }
): boolean {
  // Strategy 1: Check metadata for official identifier
  const metadata = message.metadata;
  if (metadata) {
    if (metadata['followUpTask'] === true || metadata['followup_task'] === true) {
      return true;
    }
    if (metadata['taskType'] === "followup" || metadata['task_type'] === "followup") {
      return true;
    }
  }

  // Strategy 2: Check message name
  const name = message.name;
  if (name === "followup_task" || name === "followUpTask" || name === "follow-up-task") {
    return true;
  }

  return false;
}

