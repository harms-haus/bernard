import type { BernardStateType } from "./state";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import type { StructuredToolInterface } from "@langchain/core/tools";

/**
 * Tool Node - Executes tool calls in parallel
 * 
 * This node executes all tool calls from the last AIMessage in parallel
 * and returns ToolMessage results.
 */
export function createToolNode(tools: StructuredToolInterface[]) {
  const toolsByName = Object.fromEntries(
    tools.map((tool) => [tool.name, tool])
  );

  return async function toolNode(state: BernardStateType): Promise<Partial<BernardStateType>> {
    const lastMessage = state.messages[state.messages.length - 1];

    if (!lastMessage || !AIMessage.isInstance(lastMessage)) {
      return { messages: [] };
    }

    const toolCalls = lastMessage.tool_calls ?? [];
    if (toolCalls.length === 0) {
      return { messages: [] };
    }

    // Execute all tool calls in parallel
    const toolResults = await Promise.all(
      toolCalls.map(async (toolCall) => {
        const toolName = toolCall.name;
        const toolCallId = toolCall.id;
        if (!toolName || !toolCallId) {
          return new ToolMessage({
            content: `Error: Invalid tool call - missing name or id`,
            tool_call_id: toolCallId || `unknown_${Date.now()}`,
          });
        }
        const tool = toolsByName[toolName];
        if (!tool) {
          return new ToolMessage({
            content: `Error: Tool ${toolName} not found`,
            tool_call_id: toolCallId,
          });
        }

        try {
          const result = await tool.invoke(toolCall.args);
          return new ToolMessage({
            content: typeof result === "string" ? result : JSON.stringify(result),
            tool_call_id: toolCallId,
            name: toolName,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return new ToolMessage({
            content: `Error: ${errorMessage}`,
            tool_call_id: toolCallId,
            name: toolName,
          });
        }
      })
    );

    // Track which tools were used
    const usedToolNames = toolCalls.map((tc) => tc.name).filter((name): name is string => Boolean(name));

    return {
      messages: toolResults,
      toolResults: Object.fromEntries(
        toolCalls.map((tc, idx) => {
          const result = toolResults[idx];
          const toolName = tc.name || `unknown_${idx}`;
          if (!result) {
            return [toolName, ""];
          }
          return [
            toolName,
            typeof result.content === "string"
              ? result.content
              : JSON.stringify(result.content),
          ];
        })
      ),
    };
  };
}

