import "dotenv/config";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";
import { createTextChatGraph } from "./src/agent/graph/text-chat.graph";
import { getRouterTools } from "./src/agent/tool";
import { createLLMCaller } from "./src/agent/llm/factory";
import { getSettings } from "./lib/config/settingsCache";
import type { RoutingAgentContext } from "./src/agent/routing.agent";
import type { ResponseAgentContext } from "./src/agent/response.agent";
import {
  BERNARD_MODEL_ID,
  isBernardModel,
  mapChatMessages,
  findLastAssistantMessage,
  contentFromMessage,
  extractUsageFromMessages,
  listModels,
  validateAuth,
  type OpenAIMessage
} from "./lib/openai";

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

      // Get tools
      const tools = getRouterTools();

      // Create contexts for LangGraph
      const routingContext: RoutingAgentContext = {
        llmCaller: routerLLMCaller,
        tools,
      };

      const responseContext: ResponseAgentContext = {
        llmCaller: responseLLMCaller,
        toolDefinitions: tools,
      };

      // Create text chat graph (voice mode not supported in this endpoint)
      const graph = createTextChatGraph(routingContext, responseContext);

      // Use chatId as thread_id or generate one
      const threadId = body.chatId || `thread_${Date.now()}`;

      // Invoke graph
      const result = await graph.invoke(
        {
          messages: inputMessages,
        },
        {
          configurable: {
            thread_id: threadId,
          },
        }
      );

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

        const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

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
        // For now, LangGraph doesn't support streaming in the same way
        // Return as non-streaming response
        const assistantMessage = findLastAssistantMessage(result.messages);
        const content = contentFromMessage(assistantMessage) ?? "";
        const usageMeta = extractUsageFromMessages(result.messages);

        const usage = {
          prompt_tokens: usageMeta.prompt_tokens ?? usageMeta.input_tokens ?? 0,
          completion_tokens: usageMeta.completion_tokens ?? usageMeta.output_tokens ?? 0,
          total_tokens: (usageMeta.prompt_tokens ?? usageMeta.input_tokens ?? 0) + (usageMeta.completion_tokens ?? usageMeta.output_tokens ?? 0)
        };

        const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

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
      }
    } catch (error) {
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
  // eslint-disable-next-line no-console
  console.log(`🚀 Bernard server running at http://${HOST}:${PORT}`);
});
