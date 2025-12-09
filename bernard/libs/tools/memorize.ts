import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { MemoryStore } from "@/lib/memoryStore";
import { memorizeValue } from "@/lib/memoryService";

export const memorizeTool = Object.assign(
  tool(
    async ({ label, content }, runOpts?: { conversationId?: string }) => {
      const conversationId = (runOpts as { conversationId?: string } | undefined)?.conversationId ?? "unknown";
      const result = await memorizeValue({ label, content, conversationId });
      return {
        outcome: result.outcome,
        memory: result.memory,
        predecessorId: result.predecessorId,
        neighborsChecked: result.neighbors.length
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

