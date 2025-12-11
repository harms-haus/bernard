import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { MemoryStore } from "@/lib/memoryStore";
import { memorizeValue } from "@/lib/memoryService";
import { withTimeout } from "@/lib/timeouts";

const BACKGROUND_TIMEOUT_MS = Number(process.env["MEMORIZE_BACKGROUND_TIMEOUT_MS"]) || 30_000;

function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const memorizeTool = Object.assign(
  tool(
    async ({ label, content }, runOpts?: { conversationId?: string }) => {
      const conversationId = (runOpts as { conversationId?: string } | undefined)?.conversationId ?? "unknown";
      // Defer the heavy work so the tool returns immediately.
      setTimeout(() => {
        void withTimeout(
          memorizeValue({ label, content, conversationId }),
          BACKGROUND_TIMEOUT_MS,
          "memorize background"
        ).catch((err) => {
          console.warn(`[memorize] background run failed: ${formatError(err)}`);
        });
      }, 0);
      return {
        status: "queued",
        label,
        conversationId,
        note: "Memorization started in background; results will be available later."
      };
    },
    {
      name: "memorize",
      description: `Remember a fact or information that is relevant to the user with a label and content, 
deduping against existing memories.`,
      schema: z.object({
        label: z.string().min(1, "label is required"),
        content: z.string().min(1, "content is required")
      })
    }
  ),
  {
    verifyConfiguration: () => MemoryStore.verifyConfiguration()
  }
);



