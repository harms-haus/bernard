import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const timerTool = tool(
  async ({ seconds, note }) => {
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    return note ? `Timer finished: ${note}` : `Timer finished after ${seconds} seconds.`;
  },
  {
    name: "set_timer",
    description: "Set a short timer (<= 60s) to wait before responding.",
    schema: z.object({
      seconds: z.number().int().min(1).max(60),
      note: z.string().optional()
    })
  }
);



