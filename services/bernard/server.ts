import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";
import { createBernardGraph } from "./src/agent/graph/bernard.graph";
import { createTextChatGraph } from "./src/agent/graph/text-chat.graph";
import { getRouterTools } from "./agent/tool";
import { createLLMCaller } from "./agent/llm/factory";
import { getSettings } from "./lib/config/settingsCache";
import type { RoutingAgentContext } from "./src/agent/routing.agent";
import type { ResponseAgentContext } from "./src/agent/response.agent";
import { HumanMessage } from "@langchain/core/messages";
import {
  BERNARD_MODEL_ID,
  isBernardModel,
  mapChatMessages,
  createScaffolding,
  findLastAssistantMessage,
  contentFromMessage,
  extractUsageFromMessages,
  listModels,
  validateAuth,
  type OpenAIMessage
} from "./lib/openai";
import { StreamingOrchestrator } from "./agent/loop/orchestrator";
import { transformAgentOutputToChunks } from "./agent/streaming/transform";
import { createSSEStream } from "./agent/streaming/sse";

const PORT = process.env["PORT"] ? parseInt(process.env["PORT"], 10) : 3001;
const HOST = process.env["HOST"] || "0.0.0.0";

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
  if (url.pathname === "/api/v1/models" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ object: "list", data: listModels() }));
    return;
  }

  // OpenAI Chat Completions
  if (url.pathname === "/api/v1/chat/completions" && req.method === "POST") {
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
      const isGhostMode = body.ghost === true;
      const start = Date.now();

      // Validate Auth
      const auth = await validateAuth(req);
      if ("error" in auth) {
        res.writeHead(auth.error.status || 401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: auth.error.message }));
        return;
      }

      const inputMessages = mapChatMessages(body.messages as OpenAIMessage[]);
      const settings = await getSettings();

      // Get model names from settings
      const routerModelSettings = settings.models.router;
      const responseModelSettings = settings.models.response;

      const scaffold = await createScaffolding({
        token: auth.token,
        responseModelOverride: responseModelSettings.primary,
        ...(body.chatId ? { conversationId: body.chatId } : {}),
        ...(isGhostMode ? { ghost: true } : {})
      });

      const {
        keeper,
        conversationId,
        requestId,
        turnId
      } = scaffold;

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

      const orchestrator = new StreamingOrchestrator(
        keeper,
        routerLLMCaller,
        responseLLMCaller
      );

      const turnResult = await orchestrator.run({
        conversationId,
        incoming: inputMessages,
        persistable: inputMessages,
        requestId,
        turnId,
        trace: true
      });

      if (!shouldStream) {
        const { finalMessages } = await turnResult.result;
        const assistantMessage = findLastAssistantMessage(finalMessages);
        const content = contentFromMessage(assistantMessage) ?? "";
        const usageMeta = extractUsageFromMessages(finalMessages);
        
        const usage = {
          prompt_tokens: usageMeta.prompt_tokens ?? usageMeta.input_tokens ?? 0,
          completion_tokens: usageMeta.completion_tokens ?? usageMeta.output_tokens ?? 0,
          total_tokens: (usageMeta.prompt_tokens ?? usageMeta.input_tokens ?? 0) + (usageMeta.completion_tokens ?? usageMeta.output_tokens ?? 0)
        };

        const latencyMs = Date.now() - start;
        await keeper.endTurn(turnId, { status: "ok", latencyMs });
        await keeper.completeRequest(requestId, latencyMs);

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
      } else {
        // Streaming response
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive"
        });

        const chunks = transformAgentOutputToChunks(turnResult.stream, {
          model: BERNARD_MODEL_ID,
          requestId,
          conversationId
        });

        const sseStream = createSSEStream(chunks);
        const reader = sseStream.getReader();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
          res.end();

          const latencyMs = Date.now() - start;
          await keeper.endTurn(turnId, { status: "ok", latencyMs });
          await keeper.completeRequest(requestId, latencyMs);
        } catch {
          const latencyMs = Date.now() - start;
          await keeper.endTurn(turnId, { status: "error", latencyMs });
          await keeper.completeRequest(requestId, latencyMs);
          res.end();
        } finally {
          reader.releaseLock();
        }
      }
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
    return;
  }

  // Original Chat endpoint
  if (url.pathname === "/api/chat" && req.method === "POST") {
    try {
      let body = "";
      for await (const chunk of req) {
        const chunkStr = typeof chunk === "string" ? chunk : (chunk as Buffer).toString("utf8");
        body += chunkStr;
      }
      const parsedBody = JSON.parse(body) as { message?: unknown; conversationId?: string; isVoice?: boolean };
      const { message, conversationId, isVoice = false } = parsedBody;

      // Get settings and create LLM callers
      const settings = await getSettings();
      
      // Get router provider and model
      const routerModelSettings = settings.models.router;
      const routerProvider = settings.models.providers?.find(p => p.id === routerModelSettings.providerId);
      if (!routerProvider) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Router provider not found" }));
        return;
      }
      
      // Get response provider and model
      const responseModelSettings = settings.models.response;
      const responseProvider = settings.models.providers?.find(p => p.id === responseModelSettings.providerId);
      if (!responseProvider) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Response provider not found" }));
        return;
      }
      
      const routerLLMCaller = createLLMCaller(routerProvider, routerModelSettings.primary);
      const responseLLMCaller = createLLMCaller(responseProvider, responseModelSettings.primary);

      // Get tools
      const tools = getRouterTools();
      // ToolWithInterpretation extends StructuredToolInterface, so this is compatible
      const langChainTools = tools;

      // Create contexts
      const routingContext: RoutingAgentContext = {
        llmCaller: routerLLMCaller,
        tools: langChainTools,
      };

      const responseContext: ResponseAgentContext = {
        llmCaller: responseLLMCaller,
        toolDefinitions: tools,
      };

      // Create graph
      const graph = isVoice
        ? createBernardGraph(routingContext, responseContext)
        : createTextChatGraph(routingContext, responseContext);

      // Invoke graph
      const threadId = conversationId || `thread_${Date.now()}`;
      const messageContent = typeof message === "string" ? message : String(message);
      const result = await graph.invoke(
        {
          messages: [new HumanMessage(messageContent)],
        },
        {
          configurable: {
            thread_id: threadId,
          },
        }
      );

      // Extract final response
      const lastMessage = result.messages[result.messages.length - 1];
      if (!lastMessage) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "No response generated" }));
        return;
      }
      const responseText =
        typeof lastMessage.content === "string"
          ? lastMessage.content
          : JSON.stringify(lastMessage.content);

      const status = typeof result.status === "string" ? result.status : String(result.status ?? "unknown");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          response: responseText,
          conversationId: threadId,
          status,
        })
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: errorMessage }));
    }
    return;
  }

  // 404
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
}

const server = createServer(handleRequest);

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`🚀 Bernard server running at http://${HOST}:${PORT}`);
});
