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

const PORT = process.env["PORT"] ? parseInt(process.env["PORT"], 10) : 3001;
const HOST = process.env["HOST"] || "0.0.0.0";

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  // Health check
  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "bernard" }));
    return;
  }

  // Chat endpoint
  if (url.pathname === "/api/chat" && req.method === "POST") {
    try {
      let body = "";
      for await (const chunk of req) {
        body += chunk.toString();
      }
      const { message, conversationId, isVoice = false } = JSON.parse(body);

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
      const result = await graph.invoke(
        {
          messages: [new HumanMessage(message)],
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

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          response: responseText,
          conversationId: threadId,
          status: result.status,
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
  console.log(`🚀 Bernard server running at http://${HOST}:${PORT}`);
});
