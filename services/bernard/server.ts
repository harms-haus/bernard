import "dotenv/config";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";
import pino from "pino";
import { AIMessage, ToolMessage } from "@langchain/core/messages";

import {
  listModels,
  validateAuth,
  isBernardModel,
  BERNARD_MODEL_ID,
  mapChatMessages,
  type OpenAIMessage,
  findLastAssistantMessage,
  contentFromMessage,
  extractUsageFromMessages
} from "@/lib/openai";
import { getSettings } from "@/lib/config";
import { createLLMCaller } from "@/agent/llm/factory";
import { getRouterTools } from "@/agent/tool";
import type { RoutingAgentContext } from "@/agent/routing.agent";
import type { ResponseAgentContext, ResponseStreamCallback } from "@/agent/response.agent";
import { createTextChatGraph } from "@/agent/graph/text-chat.graph";
import { getRedis } from "@/lib/infra/redis";
import { traceLogger } from "@/lib/tracing/trace.logger";
import { ConversationRecordKeeper } from "@/lib/conversation/conversationRecorder";

const logger = pino({
  level: process.env["LOG_LEVEL"] ?? "info",
  base: { service: "bernard" },
  timestamp: pino.stdTimeFunctions.isoTime,
});

const PORT = process.env["BERNARD_AGENT_PORT"] ? parseInt(process.env["BERNARD_AGENT_PORT"], 10) : 8850;
const HOST = process.env["HOST"] || "127.0.0.1";

/**
 * Generate a unique message ID
 */
function generateMessageId(): string {
  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "bernard" }));
    return;
  }

  // OpenAI Models List
  if (url.pathname === "/v1/models" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ object: "list", data: listModels() }));
    return;
  }

  // OpenAI Chat Completions
  if (url.pathname === "/v1/chat/completions" && req.method === "POST") {
    const turnStartTime = Date.now();
    try {
      let bodyStr = "";
      for await (const chunk of req) {
        bodyStr += typeof chunk === "string" ? chunk : (chunk as Buffer).toString("utf8");
      }
      const body = JSON.parse(bodyStr) as {
        messages?: unknown;
        model?: string | null;
        stream?: boolean;
        ghost?: boolean;
        chatId?: string;
        conversationId?: string;
      };

      if (!body?.messages || !Array.isArray(body.messages)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "`messages` array is required" }));
        return;
      }

      if (!isBernardModel(body.model)) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Model not found", allowed: BERNARD_MODEL_ID }));
        return;
      }

      const shouldStream = body.stream === true;

      // Validate Auth
      const auth = await validateAuth(req);
      if ("error" in auth) {
        res.writeHead(auth.error.status || 401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: auth.error.message }));
        return;
      }

      const inputMessages = mapChatMessages(body.messages as OpenAIMessage[]);
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const threadId = body.chatId || `thread_${Date.now()}`;
      const conversationId = body.conversationId || `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const isGhostMode = body.ghost === true;
      const userId = "user" in auth ? (auth as { user?: { id?: string } }).user?.id ?? "anonymous" : "anonymous";
      const user = "user" in auth ? (auth as { user?: { name?: string; username?: string } }).user : undefined;
      const userName = user?.name ?? user?.username ?? "";

      // Start trace for this request
      const initialMessagesForTrace = (body.messages as Array<{ role: string; content: string }>).map(m => ({
        role: m.role,
        content: typeof m.content === "string" ? m.content : "[complex content]"
      }));
      traceLogger.startTrace(requestId, threadId, initialMessagesForTrace, shouldStream);
      traceLogger.addEvent("request_received", { request_id: requestId, thread_id: threadId, message_count: body.messages.length });
      const settings = await getSettings();

      // Get model names from settings
      const routerModelSettings = settings.models.router;
      const responseModelSettings = settings.models.response;

      // Get the providers
      const routerProvider = settings.models.providers?.find(p => p.id === routerModelSettings.providerId);
      const responseProvider = settings.models.providers?.find(p => p.id === responseModelSettings.providerId);

      if (!routerProvider || !responseProvider) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Provider not found" }));
        return;
      }

      const routerLLMCaller = createLLMCaller(routerProvider, routerModelSettings.primary);
      const responseLLMCaller = createLLMCaller(responseProvider, responseModelSettings.primary);

      // Build HA config from settings if available
      const haRestConfig = settings.services.homeAssistant?.baseUrl
        ? {
            baseUrl: settings.services.homeAssistant.baseUrl,
            accessToken: settings.services.homeAssistant.accessToken,
          }
        : undefined;

      // Get tools and detect any disabled tools
      const { tools, disabledTools } = getRouterTools(undefined, haRestConfig);

      // Initialize conversation recorder (only if not in ghost mode)
      let recorder: ConversationRecordKeeper | undefined;
      if (!isGhostMode) {
        try {
          const redis = getRedis();
          recorder = new ConversationRecordKeeper(redis);
          
           // Create conversation if it doesn't exist
          const conversationExists = await recorder.conversationExists(conversationId);
          if (!conversationExists) {
            await recorder.createConversation(conversationId, userId, userName || undefined, isGhostMode);
          }
          
          // Record user message event
          const lastMessage = inputMessages[inputMessages.length - 1];
          const userMessageContent = contentFromMessage(lastMessage ?? null) ?? "";
          const messageId = generateMessageId();
          await recorder.recordEvent(conversationId, {
            type: "user_message",
            data: {
              messageId,
              content: userMessageContent
            }
          });
        } catch (error) {
          logger.warn({ err: error }, "Failed to initialize conversation recorder");
          recorder = undefined;
        }
      }

      // Create contexts for LangGraph with recorder
      const routingContext: RoutingAgentContext = {
        llmCaller: routerLLMCaller,
        tools,
        disabledTools,
        recorder,
        conversationId,
      };

      if (!shouldStream) {
        // Non-streaming: create context without callback
        const responseContext: ResponseAgentContext = {
          llmCaller: responseLLMCaller,
          toolDefinitions: tools,
          disabledTools,
          recorder,
          conversationId,
        };

        const graph = createTextChatGraph(routingContext, responseContext);

        const timeoutMs = 5 * 60 * 1000;
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Graph execution timeout after 5 minutes")), timeoutMs);
        });

        logger.debug({ threadId, messageCount: inputMessages.length }, "Starting graph.invoke() with timeout");

        const result = await Promise.race([
          graph.invoke(
            { messages: inputMessages },
            { configurable: { thread_id: threadId } }
          ),
          timeoutPromise,
        ]);

        logger.debug({ threadId, resultMessageCount: result.messages.length }, "graph.invoke() completed");

        // Extract final assistant message from LangGraph result
        const assistantMessage = findLastAssistantMessage(result.messages);
        const content = contentFromMessage(assistantMessage) ?? "";
        const usageMeta = extractUsageFromMessages(result.messages);

        // Record assistant message event
        if (recorder && conversationId) {
          try {
            const totalDurationMs = Date.now() - turnStartTime;
            const toolCallCount = result.messages.filter(m =>
              ToolMessage.isInstance(m)
            ).length;
            const llmCallCount = result.messages.filter(m =>
              AIMessage.isInstance(m)
            ).length;
            
            await recorder.recordEvent(conversationId, {
              type: "assistant_message",
              data: {
                messageId: generateMessageId(),
                content,
                totalDurationMs,
                totalToolCalls: toolCallCount,
                totalLLMCalls: llmCallCount
              }
            });
          } catch (error) {
            logger.warn({ err: error }, "Failed to record assistant message event");
          }
        }

        const usage = {
          prompt_tokens: usageMeta.prompt_tokens ?? usageMeta.input_tokens ?? 0,
          completion_tokens: usageMeta.completion_tokens ?? usageMeta.output_tokens ?? 0,
          total_tokens: (usageMeta.prompt_tokens ?? usageMeta.input_tokens ?? 0) + (usageMeta.completion_tokens ?? usageMeta.output_tokens ?? 0)
        };

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          id: requestId,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: BERNARD_MODEL_ID,
          choices: [{
            index: 0,
            finish_reason: "stop",
            message: { role: "assistant", content }
          }],
          usage
        }));

        // Complete trace for non-streaming response
        traceLogger.recordFinalResponse(content);
        traceLogger.completeTrace();
        await traceLogger.writeTrace();
        } else {
        // Streaming: create context with streamCallback
        const streamCallback: ResponseStreamCallback = (chunk: string) => {
          const chunkData = {
            id: requestId,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: BERNARD_MODEL_ID,
            choices: [{
              index: 0,
              delta: { content: chunk },
              finish_reason: null
            }]
          };
          res.write(`data: ${JSON.stringify(chunkData)}\n\n`);
        };

        const responseContext: ResponseAgentContext = {
          llmCaller: responseLLMCaller,
          toolDefinitions: tools,
          disabledTools,
          streamCallback,
          recorder,
          conversationId,
        };

        const graph = createTextChatGraph(routingContext, responseContext);

        // True streaming - emit tokens as they're generated
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "Transfer-Encoding": "chunked"
        });

        try {
          logger.debug({ threadId, messageCount: inputMessages.length }, "Starting graph.invoke() with streaming");

          await graph.invoke(
            { messages: inputMessages },
            { configurable: { thread_id: threadId } }
          );

          logger.debug({ threadId }, "graph.invoke() completed");

          // Record assistant message event for streaming
          if (recorder && conversationId) {
            try {
              const totalDurationMs = Date.now() - turnStartTime;
              await recorder.recordEvent(conversationId, {
                type: "assistant_message",
                data: {
                  messageId: generateMessageId(),
                  content: "", // Content already streamed, record empty for streaming case
                  totalDurationMs,
                  totalToolCalls: 0, // Will be counted from events
                  totalLLMCalls: 0
                }
              });
            } catch (error) {
              logger.warn({ err: error }, "Failed to record assistant message event");
            }
          }

          // Send final chunk
          const finalChunk = {
            id: requestId,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: BERNARD_MODEL_ID,
            choices: [{
              index: 0,
              delta: {},
              finish_reason: "stop"
            }]
          };
          res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
          res.write("data: [DONE]\n\n");

        } catch (error: unknown) {
          logger.error({ err: error }, "Streaming failed");
          const errorChunk = {
            id: requestId,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: BERNARD_MODEL_ID,
            choices: [{
              index: 0,
              delta: {},
              finish_reason: "error"
            }]
          };
          res.write(`data: ${JSON.stringify(errorChunk)}\n\n`);
          res.write("data: [DONE]\n\n");
        } finally {
          // Complete trace for streaming response (content recorded incrementally via events)
          traceLogger.completeTrace();
          await traceLogger.writeTrace();
          res.end();
        }
        return;
      }
    } catch (error: unknown) {
      logger.error({ err: error }, "Request failed");
      // Complete trace on error
      traceLogger.addEvent("request_received", { error: String(error) });
      traceLogger.completeTrace();
      await traceLogger.writeTrace();
      res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      }
      return;
    }

    const conversationsMatch = url.pathname.match(/^\/api\/conversations\/([^/]+)$/);
    if (conversationsMatch) {
      const conversationId = decodeURIComponent(conversationsMatch[1] ?? '');
      const auth = await validateAuth(req);
      if ("error" in auth) {
        res.writeHead(auth.error.status || 401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: auth.error.message }));
        return;
      }

      const userId = "user" in auth ? (auth as { user?: { id?: string } }).user?.id ?? "anonymous" : "anonymous";
      const isAdmin = "user" in auth && (auth as { user?: { isAdmin?: boolean } }).user?.isAdmin === true;

      try {
        const redis = getRedis();
        const recorder = new ConversationRecordKeeper(redis);
        const conversation = await recorder.getConversation(conversationId);

        if (!conversation) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Conversation not found" }));
          return;
        }

        if (conversation.conversation.userId !== userId && !isAdmin) {
          res.writeHead(403, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Access denied" }));
          return;
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          conversation: conversation.conversation,
          events: conversation.events
        }));
        return;
      } catch (error) {
        logger.error({ err: error }, "Failed to get conversation");
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
        return;
      }
    }

    if (url.pathname === "/api/conversations" && req.method === "GET") {
      const auth = await validateAuth(req);
      if ("error" in auth) {
        res.writeHead(auth.error.status || 401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: auth.error.message }));
        return;
      }

      const userId = "user" in auth ? (auth as { user?: { id?: string } }).user?.id ?? "anonymous" : "anonymous";

      const archived = url.searchParams.get("archived") === "true";
      const limit = parseInt(url.searchParams.get("limit") || "50", 10);
      const offset = parseInt(url.searchParams.get("offset") || "0", 10);

      try {
        const redis = getRedis();
        const recorder = new ConversationRecordKeeper(redis);
        const result = await recorder.listConversations(userId, { archived, limit, offset });

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          conversations: result.conversations,
          total: result.total,
          hasMore: result.hasMore
        }));
        return;
      } catch (error) {
        logger.error({ err: error }, "Failed to list conversations");
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
        return;
      }
    }

    // GET /api/conversations/all - Admin only, list all conversations across all users
    if (url.pathname === "/api/conversations/all" && req.method === "GET") {
      const auth = await validateAuth(req);
      if ("error" in auth) {
        res.writeHead(auth.error.status || 401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: auth.error.message }));
        return;
      }

      const isAdmin = "user" in auth && (auth as { user?: { isAdmin?: boolean } }).user?.isAdmin === true;
      if (!isAdmin) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Admin access required" }));
        return;
      }

      const archived = url.searchParams.get("archived") === "true";
      const limit = parseInt(url.searchParams.get("limit") || "50", 10);
      const offset = parseInt(url.searchParams.get("offset") || "0", 10);

      try {
        const redis = getRedis();
        const recorder = new ConversationRecordKeeper(redis);
        const result = await recorder.listAllConversations({ archived, limit, offset });

        // Transform conversations to include userAssistantCount (derived from messageCount for now)
        // and ensure userName is included
        const conversations = result.conversations.map((conv) => ({
          id: conv.id,
          name: conv.name,
          description: conv.description,
          userId: conv.userId,
          userName: conv.userName,
          createdAt: conv.createdAt,
          lastTouchedAt: conv.lastTouchedAt,
          archived: conv.archived,
          messageCount: conv.messageCount,
          userAssistantCount: Math.floor(conv.messageCount / 2), // Estimate: assume user+assistant pairs
          toolCallCount: conv.toolCallCount,
        }));

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          conversations,
          total: result.total,
          hasMore: result.hasMore
        }));
        return;
      } catch (error) {
        logger.error({ err: error }, "Failed to list all conversations");
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
        return;
      }
    }

    const archiveMatch = url.pathname.match(/^\/api\/conversations\/([^/]+)\/archive$/);
    if (archiveMatch && req.method === "POST") {
      const conversationId = decodeURIComponent(archiveMatch[1] ?? '');
      const auth = await validateAuth(req);
      if ("error" in auth) {
        res.writeHead(auth.error.status || 401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: auth.error.message }));
        return;
      }

      const userId = "user" in auth ? (auth as { user?: { id?: string } }).user?.id ?? "anonymous" : "anonymous";
      const isAdmin = "user" in auth && (auth as { user?: { isAdmin?: boolean } }).user?.isAdmin === true;

      try {
        const redis = getRedis();
        const recorder = new ConversationRecordKeeper(redis);
        const conversation = await recorder.getConversationMetadata(conversationId);

        if (!conversation) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Conversation not found" }));
          return;
        }

        if (conversation.userId !== userId && !isAdmin) {
          res.writeHead(403, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Access denied" }));
          return;
        }

        const success = await recorder.archiveConversation(conversationId, userId);
        if (!success) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Failed to archive conversation" }));
          return;
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          archivedAt: new Date().toISOString()
        }));
        return;
      } catch (error) {
        logger.error({ err: error }, "Failed to archive conversation");
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
        return;
      }
    }

    const deleteMatch = url.pathname.match(/^\/api\/conversations\/([^/]+)$/);
    if (deleteMatch && req.method === "DELETE") {
      const conversationId = decodeURIComponent(deleteMatch[1] ?? '');
      const auth = await validateAuth(req);
      if ("error" in auth) {
        res.writeHead(auth.error.status || 401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: auth.error.message }));
        return;
      }

      const isAdmin = "user" in auth && (auth as { user?: { isAdmin?: boolean } }).user?.isAdmin === true;
      const adminId = "user" in auth ? (auth as { user?: { id?: string } }).user?.id ?? "anonymous" : "anonymous";

      if (!isAdmin) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Admin access required" }));
        return;
      }

      try {
        const redis = getRedis();
        const recorder = new ConversationRecordKeeper(redis);
        const success = await recorder.deleteConversation(conversationId, adminId);

        if (!success) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Conversation not found" }));
          return;
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
        return;
      } catch (error) {
        logger.error({ err: error }, "Failed to delete conversation");
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
        return;
      }
    }

  // 404
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
}

const server = createServer(handleRequest);

server.listen(PORT, HOST, () => {
  logger.info({ host: HOST, port: PORT }, "Bernard server running");
});

// Graceful shutdown handling for tsx watch restarts
let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  logger.info({ signal }, "Received shutdown signal, starting graceful shutdown");

  // Close HTTP server with a timeout
  const httpTimeout = setTimeout(() => {
    logger.warn("HTTP server close timeout, forcing exit");
    process.exit(1);
  }, 3000);

  try {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
    clearTimeout(httpTimeout);
    logger.info("HTTP server closed");
  } catch (err: unknown) {
    clearTimeout(httpTimeout);
    logger.error({ err }, "Error closing HTTP server");
  }

  // Disconnect Redis if connected
  try {
    const redis = getRedis();
    if (redis.status === "ready" || redis.status === "connect") {
      await redis.quit();
      logger.info("Redis connection closed");
    }
  } catch (err: unknown) {
    logger.warn({ err }, "Error closing Redis connection");
  }

  // Give the event loop a chance to clean up, then exit
  setTimeout(() => {
    logger.info("Exiting process");
    process.exit(0);
  }, 100);
}

// Register signal handlers for graceful shutdown
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
