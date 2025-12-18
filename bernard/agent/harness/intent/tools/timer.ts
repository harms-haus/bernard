import { tool } from "@langchain/core/tools";

export const timerTool = tool(
  async ({ seconds, note }) => {
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    return note ? `Timer finished: ${note}` : `Timer finished after ${seconds} seconds.`;
  },
  {
    name: "set_timer",
    description: "Set a short timer (<= 60s) to wait before responding.",
    schema: {
      type: "object",
      properties: {
        seconds: {
          type: "number",
          description: "Number of seconds to wait (1-60)"
        },
        note: {
          type: "string",
          description: "Optional note to display when timer finishes"
        }
      },
      required: ["seconds"]
    }
  }
);
