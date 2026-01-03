import { AIMessage, createMiddleware, ToolMessage } from "langchain";
import type { Tracer } from "../trace/tracer";
import type { ClientTool, ServerTool } from "@langchain/core/tools";

export const createTracingMiddleware = (data: {tracer: Tracer, agent: string, model: string, tools?: (ServerTool | ClientTool)[] | undefined, conversationId?: string | undefined}) => {
  return createMiddleware({
    name: "TracingMiddleware",
    wrapModelCall: async (request, handler) => {
      const llmCallId: string = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const startTime: number = Date.now();

      try {
        // record the latest user message
        data.tracer.userMessage({
          id: llmCallId,
          conversationId: data.conversationId,
          content: request.messages.filter((message) => message.type === "human")[-1]?.content,
        });

        // record the LLM call start
        data.tracer.llmCallStart({ 
          id: llmCallId,
          conversationId: data.conversationId,
          model: data.model,
          agent: data.agent,
          messages: request.messages,
          tools: data.tools,
        });

        const response = await handler(request);
        
        // record the LLM call complete
        const endTime = Date.now();
        const duration = endTime - (startTime ?? 0);
        data.tracer.llmCallComplete({
          id: llmCallId,
          conversationId: data.conversationId,
          model: data.model,
          agent: data.agent,
          content: response.content,
          duration: duration,
        });

        // record the assistant message
        data.tracer.assistantMessage({
          id: llmCallId,
          conversationId: data.conversationId,
          content: response.content,
        });

        return response;
      } catch (error) {
        const endTime = Date.now();
        const duration = endTime - (startTime ?? 0);
        // record the LLM call error
        data.tracer.llmCallError({
          id: llmCallId,
          model: data.model,
          agent: data.agent,
          error: error instanceof Error ? error.message : String(error),
          duration: duration,
          conversationId: data.conversationId,
        });

        // return the error message so the user can see the error
        return new AIMessage({
          id: llmCallId,
          content: `Error: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
    wrapToolCall: async (request, handler) => {
      const toolCallId: string = `t${Math.random().toString(36)}`;
      let startTime: number | undefined = undefined;
      try {
        startTime = Date.now();

        // record the tool call start
        data.tracer.toolCallStart({
          id: toolCallId,
          conversationId: data.conversationId,
          name: request.toolCall.name,
          arguments: request.toolCall.args,
        });

        const result = await handler(request) as ToolMessage;

        const endTime = Date.now();
        const duration = endTime - (startTime ?? 0);
        // record the tool call complete
        data.tracer.toolCallComplete({
          id: toolCallId,
          conversationId: data.conversationId,
          name: request.toolCall.name,
          result: result?.content,
          duration: duration,
        });

        return result;
      } catch (error) {
        const endTime = Date.now();
        const duration = endTime - (startTime ?? 0);
        // record the tool call error
        data.tracer.toolCallError({
          id: toolCallId,
          conversationId: data.conversationId,
          name: request.toolCall.name,
          error: error instanceof Error ? error.message : String(error),
          duration: duration,
        });

        // return the error message so the user can see the error
        const errorMessage = error instanceof Error ? error.message : String(error);
        return new ToolMessage({
          tool_call_id: request.toolCall.id!,
          content: `Tool call error: please check you input and try again. ${errorMessage}`,
        })
      }
    },
  });
};