
import { createMiddleware } from "langchain";
import type { ClientTool, ServerTool } from "@langchain/core/tools";
import type { Logger } from "pino";

export const createLoggingMiddleware = (data: {logger: Logger, agent: string, model: string, tools?: (ServerTool | ClientTool)[] | undefined, conversationId?: string | undefined}) => {
  return createMiddleware({
    name: "LoggingMiddleware",
    wrapModelCall: async (request, handler) => {
      data.logger.info({
        timestamp: new Date().toISOString(),
        agent: data.agent,
        model: data.model,
        tools: data.tools,
        conversationId: data.conversationId,
        request: request,
      }, "LLM call started");
      try {
        const response = await handler(request);

        data.logger.info({
          timestamp: new Date().toISOString(),
          agent: data.agent,
          model: data.model,
          tools: data.tools,
          conversationId: data.conversationId,
          request: request,
        }, "LLM call completed");
        return response;
      } catch (error) {
        data.logger.error({
          timestamp: new Date().toISOString(),
          agent: data.agent,
          model: data.model,
          tools: data.tools,
          conversationId: data.conversationId,
          request: request,
        }, "LLM call error");
        throw error;
      }
    },
    wrapToolCall: async (request, handler) => {
      data.logger.info({
        timestamp: new Date().toISOString(),
        agent: data.agent,
        model: data.model,
        tools: data.tools,
        conversationId: data.conversationId,
        request: request,
      }, "Tool call started");
        
      try {
        const response = await handler(request);

        data.logger.info({
          timestamp: new Date().toISOString(),
          agent: data.agent,
          model: data.model,
          tools: data.tools,
          conversationId: data.conversationId,
          request: request,
        }, "Tool call completed");
        return response;
      } catch (error) {
        data.logger.error({
          timestamp: new Date().toISOString(),
          agent: data.agent,
          model: data.model,
          tools: data.tools,
          conversationId: data.conversationId,
          request: request,
        }, "Tool call error");
        throw error;
      }
    }
  });
};