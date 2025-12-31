import "dotenv/config";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";
import pino from "pino";

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
import type { ResponseAgentContext } from "@/agent/response.agent";
import { createTextChatGraph } from "@/agent/graph/text-chat.graph";
import { getRedis } from "@/lib/infra/redis";
import { traceLogger } from "@/lib/tracing/trace.logger";

const logger = pino({
  level: process.env["LOG_LEVEL"] ?? "info",
  base: { service: "bernard" },
  timestamp: pino.stdTimeFunctions.isoTime,
});

const PORT = process.env["BERNARD_AGENT_PORT"] ? parseInt(process.env["BERNARD_AGENT_PORT"], 10) : 8850;
const HOST = process.env["HOST"] || "127.0.0.1";

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

      // Create contexts for LangGraph
      const routingContext: RoutingAgentContext = {
        llmCaller: routerLLMCaller,
        tools,
        disabledTools,
      };

      const responseContext: ResponseAgentContext = {
        llmCaller: responseLLMCaller,
        toolDefinitions: tools,
        disabledTools,
      };

      // Create text chat graph (voice mode not supported in this endpoint)
      const graph = createTextChatGraph(routingContext, responseContext);

      const timeoutMs = 5 * 60 * 1000;
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Graph execution timeout after 5 minutes")), timeoutMs);
      });

      logger.debug({ threadId, messageCount: inputMessages.length }, "Starting graph.invoke() with timeout");

      const result = await Promise.race([
        graph.invoke(
          {
            messages: inputMessages,
          },
          {
            configurable: {
              thread_id: threadId,
            },
          }
        ),
        timeoutPromise,
      ]);

      logger.debug({ threadId, resultMessageCount: result.messages.length }, "graph.invoke() completed");

      if (!shouldStream) {
        // Extract final assistant message from LangGraph result
        const assistantMessage = findLastAssistantMessage(result.messages);
        const content = contentFromMessage(assistantMessage) ?? "";
        const usageMeta = extractUsageFromMessages(result.messages);

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
        // True streaming with proper message ordering
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "Transfer-Encoding": "chunked"
        });

        try {
          // Use message-mode streaming which preserves message ordering
          logger.debug({ threadId, messageCount: inputMessages.length }, "Starting stream");

          const stream = await graph.stream(
            { messages: inputMessages },
            {
              configurable: { thread_id: threadId },
              streamMode: ["messages"] as const,
            }
          );

          logger.debug({ threadId }, "Stream started, waiting for events");

          let responseText = "";
          let eventCount = 0;
          const emittedMessageHashes = new Set<string>();

          for await (const event of stream) {
            eventCount++;
            logger.debug({ threadId, eventCount, channel: event[0] }, "Received stream event");

            // event is [channel, value] tuple from messages mode
            const [channel, value] = event as [string, unknown];
            logger.debug({ threadId, channel, valueType: Array.isArray(value) ? "array" : typeof value }, "Event details");

            // Only process messages channel, not other state updates
            if (channel === "messages" && Array.isArray(value)) {
              logger.debug({ threadId, messageCount: value.length }, "Processing messages channel");

              const messages = value as Record<string, unknown>[];

              if (eventCount <= 3) {
                logger.debug({ threadId, eventCount, messageCount: messages.length }, "First few events - messages overview");
                for (let m = 0; m < Math.min(messages.length, 5); m++) {
                  const msg = messages[m];
                  const msgContent = (msg as { content?: unknown }).content;
                  const msgType = (msg as { type?: string }).type;
                  const msgRole = (msg as { role?: string }).role;
                  const contentPreview = typeof msgContent === 'string' 
                    ? msgContent.substring(0, 100).replace(/\n/g, '\\n')
                    : String(msgContent).substring(0, 100);
                  logger.debug({ threadId, msgIndex: m, msgType, msgRole, contentPreview, contentLength: typeof msgContent === 'string' ? msgContent.length : 'N/A' }, "Message details");
                }
              }

              // Find the latest assistant message without tool_calls (final response)
              for (let i = messages.length - 1; i >= 0; i--) {
                const msg = messages[i];
                if (!msg) continue;

                // Safely get message type - LangGraph may return plain objects
                let msgType: string | undefined;
                try {
                  const msgTypeGetter = (msg as { _getType?: () => string })._getType;
                  msgType = msgTypeGetter ? msgTypeGetter() : (msg as { type?: string }).type;
                } catch {
                  // Fallback for malformed messages
                  msgType = (msg as { type?: string }).type;
                }
                const role = (msg as { role?: string }).role;

                // Check if it's an AI/assistant message without tool_calls
                const isAiMessage = msgType === "ai" || role === "assistant";
                const hasToolCalls = (msg as { tool_calls?: unknown[] }).tool_calls?.length;

                if (isAiMessage && !hasToolCalls && "content" in msg) {
                  const content = (msg as { content: string }).content;
                  if (typeof content === "string" && content.length > 0) {
                    // Only emit content after we've seen tool calls or we're deep in the stream
                    // This prevents the router's "I'm ready" message from being streamed
                    // before the response node actually runs
                    const seenToolCalls = messages.some(m => (m as { type?: string }).type === "tool");
                    const shouldEmit = seenToolCalls || eventCount > 3;

                    if (shouldEmit) {
                      // Create a hash of the message content to detect duplicates
                      // This handles LangGraph's known issue of emitting the same message multiple times
                      const contentHash = `${msgType}:${typeof content === 'string' ? content : String(content)}`;
                      
                      // Skip if we've already emitted this exact message content
                      if (emittedMessageHashes.has(contentHash)) {
                        logger.debug({ threadId, contentPreview: content.substring(0, 50) }, "Skipping duplicate message content");
                        break;
                      }
                      
                      // Emit delta for new content
                      const delta = content.slice(responseText.length);
                      if (delta) {
                        responseText = content;
                        emittedMessageHashes.add(contentHash);

                        const chunkData = {
                          id: requestId,
                          object: "chat.completion.chunk",
                          created: Math.floor(Date.now() / 1000),
                          model: BERNARD_MODEL_ID,
                          choices: [{
                            index: 0,
                            delta: { content: delta },
                            finish_reason: null
                          }]
                        };
                        res.write(`data: ${JSON.stringify(chunkData)}\n\n`);
                      }
                    } else {
                      logger.debug({ threadId, eventCount, contentPreview: content.substring(0, 50) }, "Skipping early router content");
                    }
                  }
                  break; // Only emit from the most recent response
                }
              }
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
