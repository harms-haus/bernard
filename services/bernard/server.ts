import "dotenv/config";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";
import pino from "pino";
import path from "node:path";

import type {
  OpenAIMessage,
} from "@/lib/openai";
import {
  listModels,
  validateAuth,
  isBernardModel,
  BERNARD_MODEL_ID,
  mapChatMessages,
} from "@/lib/openai";
import { getSettings } from "@/lib/config";
import { getReactTools } from "@/agent/tool";
import type { AgentContext } from "@/agent/agentContext";
import { createBernardGraph, runBernardGraph } from "@/agent/graph/bernard.graph";
import { getRedis } from "@/lib/infra/redis";
import { getRedisCheckpointer, closeRedisCheckpointer } from "@/lib/checkpointer/redis";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import type { BernardSettings } from "@shared/config/appSettings";
import { type onEventData, type Tracer } from "./src/agent/trace";
import { BernardTracer } from "./src/agent/trace/bernard.tracer";

let checkpointer: BaseCheckpointSaver;

const logger = pino({
  level: process.env["LOG_LEVEL"] ?? "info",
  base: { service: "bernard" },
  timestamp: pino.stdTimeFunctions.isoTime,
});

const PORT = process.env["BERNARD_AGENT_PORT"] ? parseInt(process.env["BERNARD_AGENT_PORT"], 10) : 8850;
const HOST = process.env["HOST"] || "127.0.0.1";

async function initializeCheckpointer(): Promise<void> {
  try {
    checkpointer = await getRedisCheckpointer();
    logger.info("Redis checkpointer initialized");
  } catch (error) {
    logger.error({ error }, "Failed to initialize Redis checkpointer");
    process.exit(1);
  }
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

      // Validate Auth
      const auth = await validateAuth(req);
      if (auth && "error" in auth) {
        res.writeHead(auth.error.status || 401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: auth.error.message }));
        return;
      }

      const shouldStream = body.stream === true;
      const inputMessages = mapChatMessages(body.messages as OpenAIMessage[]);
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const threadId = body.chatId || `thread_${Date.now()}`;
      const conversationId = body.conversationId || `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const isGhostMode = body.ghost === true;
      const tracer = createTracer(!isGhostMode);

      tracer.requestStart({
        id: requestId,
        conversationId: conversationId,
        model: body.model ?? BERNARD_MODEL_ID,
        agent: "bernard",
        messages: inputMessages,
      });

      // fail fast if model or provider not found
      const settings = await getSettings();
      const setingsValidation = validateSettings(settings);

      if (!setingsValidation.success) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: setingsValidation.error ?? "Unknown error" }));
        return;
      }

      // Get tools and detect any disabled tools
      const { tools, disabledTools } = await getReactTools();

      // Create contexts for LangGraph with recorder
      const agentContext: AgentContext = {
        checkpointer,
        tools,
        disabledTools,
        logger,
        tracer,
      };

      try {
        logger.debug({ threadId, messageCount: inputMessages.length }, "Creating graph");

        const graph = createBernardGraph(agentContext);

        logger.debug({ threadId, messageCount: inputMessages.length }, "Starting graph stream");

        const stream = runBernardGraph(graph, inputMessages, shouldStream, threadId);

        // let chunkCount = 0;
        for await (const chunk of stream) {
          // chunkCount++;
          if (chunk.type === "messages") {
            const message = chunk.content;
            const chunkData = {
              id: requestId,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model: BERNARD_MODEL_ID,
              choices: [{
                index: 0,
                delta: { content: message },
                finish_reason: null
              }]
            };
            res.write(`data: ${JSON.stringify(chunkData)}\n\n`);
          } else if (chunk.type === "updates") {
            // Extract the actual text content from the updates object
            // Format is {"nodeName": { messages: [...] }}
            let textContent = "";
            if (typeof chunk.content === 'object' && chunk.content !== null) {
              const content = chunk.content as Record<string, unknown>;
              
              // Find the messages array inside the node update (e.g., content['response'].messages)
              let messages: unknown[] | undefined;
              for (const key of Object.keys(content)) {
                const nodeUpdate = content[key] as Record<string, unknown>;
                if (nodeUpdate['messages'] && Array.isArray(nodeUpdate['messages'])) {
                  messages = nodeUpdate['messages'] as unknown[];
                  break;
                }
              }

              if (messages && messages.length > 0) {
                // Find the last AI message with actual content
                for (let i = messages.length - 1; i >= 0; i--) {
                  const msg = messages[i] as { kwargs?: { content?: unknown } };
                  const contentStr = msg.kwargs?.content;
                  if (typeof contentStr === 'string' && contentStr.trim().length > 0 && !contentStr.startsWith('(')) {
                    textContent = contentStr;
                    break;
                  }
                }
              }
            }

            if (textContent) {
              const chunkData = {
                id: requestId,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model: BERNARD_MODEL_ID,
                choices: [{
                  index: 0,
                  delta: { content: textContent },
                  finish_reason: null
                }]
              };
              res.write(`data: ${JSON.stringify(chunkData)}\n\n`);
            }
          }
        }
        
        // Send final chunk with finish_reason: stop and [DONE]
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
        res.end();
      }
      return;
    } catch (error: unknown) {
      logger.error({ err: error }, "Request failed");
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      return;
    }
  }

  // 404
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
}

const server = createServer(handleRequest);

// Initialize checkpointer before starting server
initializeCheckpointer().then(() => {
  server.listen(PORT, HOST, () => {
    logger.info({ host: HOST, port: PORT }, "Bernard server running");
  });
}).catch((error) => {
  logger.error({ error }, "Failed to start Bernard server");
  process.exit(1);
});

// Graceful shutdown handling for tsx watch restarts
let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  logger.info({ signal }, "Received shutdown signal, starting graceful shutdown");

  try {
    logger.info("Flushing trace writes...");
    const tracer = createTracer(false) as BernardTracer;
    await tracer.flush();
  } catch (error) {
    logger.warn({ error }, "Failed to flush trace writes");
  }

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

  // Close Redis checkpointer
  try {
    await closeRedisCheckpointer();
    logger.info("Redis checkpointer closed");
  } catch (err: unknown) {
    logger.warn({ err }, "Error closing Redis checkpointer");
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

function validateSettings(settings: BernardSettings): { success: boolean, error?: string } {  

  // Get model names from settings
  const reactModelSettings = settings.models.router;
  const responseModelSettings = settings.models.response;

  if (!reactModelSettings || !responseModelSettings) {
    return { success: false, error: "Provider not found" };
  }

  // Get the providers
  const reactProvider = settings.models.providers?.find(p => p.id === reactModelSettings.providerId);
  const responseProvider = settings.models.providers?.find(p => p.id === responseModelSettings.providerId);

  if (!reactProvider || !responseProvider) {
    return { success: false, error: "Provider not found" };
  }

  return { success: true };
}

function createTracer(keepConversation: boolean): Tracer {
  const traceFilePath = process.env["TRACE_FILE_PATH"]
    ? path.join(process.cwd(), process.env["TRACE_FILE_PATH"])
    : undefined;

  const tracer = new BernardTracer({ traceFilePath });

  if (keepConversation) {
    tracer.onEvent((event: onEventData) => {
      try {
        console.warn(event);
      } catch (callbackError) {
        console.error("Tracer callback failed:", callbackError);
      }
    });
  }
  return tracer;
}
