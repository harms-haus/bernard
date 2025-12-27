import type { Job } from "bullmq";
import type { AutomationJobPayload, AutomationResult, AutomationContext } from "./types";
import { getAutomation, updateAutomationSettings } from "./registry";

function errorLog(logger: ((message: string, meta?: Record<string, unknown>) => void) | undefined, message: string, meta?: Record<string, unknown>) {
  if (logger) logger(`ERROR: ${message}`, meta);
}

/**
 * Build the automation executor function that processes jobs from the queue
 */
export function buildAutomationExecutor() {
  return async function executor(job: Job<AutomationJobPayload, unknown, string>): Promise<AutomationResult> {
    const { automationId, event } = job.data;

    // Get the automation
    const entry = await getAutomation(automationId);
    if (!entry) {
      return { ok: false, reason: "automation_not_found" };
    }

    const { automation, settings } = entry;

    // Check if automation is enabled
    if (!settings.enabled) {
      return { ok: true, reason: "automation_disabled" };
    }

    // Create execution context
    const context: AutomationContext = {
      logger: (_message: string, _meta?: Record<string, unknown>) => {
        // Logger will be called by individual automations
      },
      settings
    };

    // Execute the automation with timing
    const startTime = Date.now();
    let result: AutomationResult;

    try {
      result = await automation.execute(event, context);

      const duration = Date.now() - startTime;

      // Update automation settings with execution metadata
      await updateAutomationSettings(automationId, {
        lastRunTime: Date.now(),
        lastRunDuration: duration,
        runCount: settings.runCount + 1
      });

    } catch (err) {
      const duration = Date.now() - startTime;
      const errorMessage = err instanceof Error ? err.message : String(err);

      errorLog(context.logger, "Automation execution threw exception", {
        automationId,
        eventName: event.name,
        duration,
        error: errorMessage
      });

      result = { ok: false, reason: "execution_error", meta: { error: errorMessage } };
    }

    return result;
  };
}

/**
 * Create a job processor that validates payload and executes automations
 */
export function createAutomationProcessor() {
  const executor = buildAutomationExecutor();

  return async function processor(job: Job<AutomationJobPayload, unknown, string>): Promise<AutomationResult> {
    const { automationId, event } = job.data;

    // Basic payload validation
    if (!automationId || !event || !event.name || !event.data) {
      errorLog(undefined, "Invalid automation job payload", { jobId: job.id });
      throw new Error("invalid automation payload");
    }

    return executor(job);
  };
}
