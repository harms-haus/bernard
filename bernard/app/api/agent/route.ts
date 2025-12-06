import { NextRequest } from "next/server";

import { getGraph, mapOpenAIToMessages, type OpenAIMessage } from "@/lib/agent";
import { getRedis } from "@/lib/redis";
import { TokenStore } from "@/lib/tokenStore";

export const runtime = "nodejs";

type AgentRequestBody = {
  messages: OpenAIMessage[];
  stream?: boolean;
};

function bearerToken(req: NextRequest) {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

export async function POST(req: NextRequest) {
  const token = bearerToken(req);
  if (!token) {
    return new Response(JSON.stringify({ error: "Missing bearer token" }), {
      status: 401
    });
  }

  const store = new TokenStore(getRedis());
  const auth = await store.validate(token);
  if (!auth) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401
    });
  }

  let body: AgentRequestBody | null = null;
  try {
    body = (await req.json()) as AgentRequestBody;
  } catch (err) {
    return new Response(JSON.stringify({ error: "Invalid JSON", detail: String(err) }), {
      status: 400
    });
  }

  if (!body?.messages || !Array.isArray(body.messages)) {
    return new Response(JSON.stringify({ error: "`messages` array is required" }), {
      status: 400
    });
  }

  const graph = getGraph();
  const inputMessages = mapOpenAIToMessages(body.messages);
  const shouldStream = body.stream ?? true;

  if (!shouldStream) {
    const result = await graph.invoke({ messages: inputMessages });
    return Response.json({ messages: result.messages });
  }

  const encoder = new TextEncoder();
  const iterator = await graph.stream(
    { messages: inputMessages },
    { streamMode: "updates" as const }
  );

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of iterator) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "Cache-Control": "no-cache, no-transform"
    }
  });
}

