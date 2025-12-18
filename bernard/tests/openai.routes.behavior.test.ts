import assert from "node:assert/strict";
import { beforeAll, test, vi } from "vitest";

import { NextRequest } from "next/server";

const BERNARD_MODEL_ID = "bernard-v1";

type BaseMsg = { content?: string; type: string };

const state = {
  authOk: true,
  modelOk: true,
  usageMeta: { prompt_tokens: 1, completion_tokens: 2 },
  invokeResult: { messages: [] as BaseMsg[] },
  streamChunks: [] as BaseMsg[][],
  streamError: false,
  runWithDetails: {
    transcript: [] as BaseMsg[],
    historyLength: 0,
    response: { message: { content: "hi", type: "ai" } as BaseMsg }
  },
  runWithDetailsError: false
};

const keeper = {
  endTurnCalls: [] as unknown[],
  completeCalls: [] as unknown[],
  async endTurn(...args: unknown[]) {
    keeper.endTurnCalls.push(args);
  },
  async completeRequest(...args: unknown[]) {
    keeper.completeCalls.push(args);
  }
};

vi.mock("@/app/api/v1/_lib/openai", () => ({
  BERNARD_MODEL_ID,
  contentFromMessage: (msg: BaseMsg | null) => msg?.content ?? null,
  validateAuth: async () => (state.authOk ? { token: "tok" } : { error: new Response("unauth", { status: 401 }) }),
  createScaffolding: async () => ({
    keeper,
    conversationId: "conv",
    requestId: "req",
    turnId: "turn",
    responseModelName: "resp-model",
    intentModelName: "intent-model",
    isNewConversation: true
  }),
  extractMessagesFromChunk: (chunk: unknown) => (Array.isArray(chunk) ? (chunk as BaseMsg[]) : null),
  extractUsageFromMessages: () => state.usageMeta,
  findLastAssistantMessage: (msgs: BaseMsg[]) => (msgs.length ? msgs[msgs.length - 1] : null),
  hydrateMessagesWithHistory: async (_opts: unknown) => (_opts as { incoming: BaseMsg[] }).incoming,
  mapCompletionPrompt: (prompt: string) => [{ content: prompt, type: "human" }],
  mapChatMessages: (msgs: BaseMsg[]) => msgs,
  isBernardModel: (model?: string | null) => state.modelOk && (!model || model === BERNARD_MODEL_ID)
}));

vi.mock("@/app/api/v1/_lib/openai/modelBuilders", () => ({
  buildIntentLLM: (cfg: unknown) => ({ intent: cfg }),
  buildResponseLLM: (cfg: unknown, request: unknown) => ({ response: cfg, request })
}));

vi.mock("@/app/api/v1/_lib/openai/chatChunks", () => ({
  chunkContent: (content: string) => content.split(" "),
  buildToolChunks: (transcript: BaseMsg[]) => {
    return transcript.length
      ? [
          {
            tool_calls: [{ id: "tool-1", type: "function", function: { name: "fn", arguments: "{}" } }],
            tool_outputs: [{ id: "tool-1", content: "out" }]
          }
        ]
      : [];
  }
}));

vi.mock("@/lib/config/models", () => ({
  resolveModel: async () => ({ id: "resp-model", options: {} })
}));

vi.mock("@/lib/agent", () => ({
  buildGraph: async () => ({
    invoke: async () => state.invokeResult,
    stream: async function* () {
      if (state.streamError) throw new Error("stream-fail");
      for (const chunk of state.streamChunks) {
        yield chunk;
      }
    },
    runWithDetails: async () => {
      if (state.runWithDetailsError) throw new Error("run-fail");
      return state.runWithDetails;
    }
  })
}));

let completionsRoute: Awaited<typeof import("../app/api/v1/completions/route")>;
let chatRoute: Awaited<typeof import("../app/api/v1/chat/completions/route")>;

beforeAll(async () => {
  completionsRoute = await import("../app/api/v1/completions/route");
  chatRoute = await import("../app/api/v1/chat/completions/route");
});

const readResponseBody = async (res: Response) => {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const combined = Buffer.concat(chunks).toString("utf-8");
  return combined;
};

test("completions rejects invalid JSON", async () => {
  const req = new NextRequest(new Request("http://localhost/api", { method: "POST", body: "{" }));
  const res = await completionsRoute.POST(req);
  assert.equal(res.status, 400);
});

test("completions enforces prompt and unsupported keys", async () => {
  const missing = new NextRequest(new Request("http://localhost/api", { method: "POST", body: JSON.stringify({}) }));
  const res1 = await completionsRoute.POST(missing);
  assert.equal(res1.status, 400);

  const badN = new NextRequest(
    new Request("http://localhost/api", { method: "POST", body: JSON.stringify({ prompt: "hi", n: 2 }) })
  );
  const res2 = await completionsRoute.POST(badN);
  assert.equal(res2.status, 400);
});

test("completions rejects wrong model", async () => {
  state.modelOk = false;
  const req = new NextRequest(
    new Request("http://localhost/api", { method: "POST", body: JSON.stringify({ prompt: "hi" }) })
  );
  const res = await completionsRoute.POST(req);
  assert.equal(res.status, 404);
  state.modelOk = true;
});

test("completions returns non-streamed completion with usage", async () => {
  state.invokeResult = { messages: [{ content: "hello", type: "ai" }] };
  const req = new NextRequest(
    new Request("http://localhost/api", { method: "POST", body: JSON.stringify({ prompt: "hi" }) })
  );
  const res = await completionsRoute.POST(req);
  const json = await res.json();
  assert.equal(res.status, 200);
  assert.equal(json.choices[0].text, "hello");
  assert.equal(json.usage.total_tokens, 3);
});

test("completions streams incremental chunks and usage", async () => {
  state.streamError = false;
  state.streamChunks = [
    [{ content: "Hello", type: "ai" }],
    [{ content: "Hello world", type: "ai" }]
  ];
  const req = new NextRequest(
    new Request("http://localhost/api", {
      method: "POST",
      body: JSON.stringify({ prompt: "hi", stream: true, stream_options: { include_usage: true } })
    })
  );
  const res = await completionsRoute.POST(req);
  const body = await readResponseBody(res);
  assert.ok(body.includes("Hello"));
  assert.ok(body.includes('"usage"'));
  assert.ok(body.includes("[DONE]"));
});

test("chat completion rejects invalid JSON and unsupported keys", async () => {
  const bad = new NextRequest(new Request("http://localhost/api", { method: "POST", body: "{" }));
  const res1 = await chatRoute.POST(bad);
  assert.equal(res1.status, 400);

  const unsupported = new NextRequest(
    new Request("http://localhost/api", { method: "POST", body: JSON.stringify({ messages: [], n: 2 }) })
  );
  const res2 = await chatRoute.POST(unsupported);
  assert.equal(res2.status, 400);
});

test("chat completion rejects wrong model", async () => {
  state.modelOk = false;
  const req = new NextRequest(
    new Request("http://localhost/api", { method: "POST", body: JSON.stringify({ messages: [] }) })
  );
  const res = await chatRoute.POST(req);
  assert.equal(res.status, 404);
  state.modelOk = true;
});

test("chat completion returns non-streamed message with usage", async () => {
  state.invokeResult = { messages: [{ content: "chat", type: "ai" }] };
  const req = new NextRequest(
    new Request("http://localhost/api", { method: "POST", body: JSON.stringify({ messages: [] }) })
  );
  const res = await chatRoute.POST(req);
  const json = await res.json();
  assert.equal(json.choices[0].message.content, "chat");
  assert.equal(json.usage.total_tokens, 3);
});

test("chat completion streams tool calls, content, and usage", async () => {
  state.runWithDetailsError = false;
  state.runWithDetails = {
    transcript: [{ content: "tool delta", type: "tool" }],
    historyLength: 0,
    response: { message: { content: "hello world", type: "ai" } }
  };
  const req = new NextRequest(
    new Request("http://localhost/api", {
      method: "POST",
      body: JSON.stringify({ messages: [], stream: true, stream_options: { include_usage: true } })
    })
  );
  const res = await chatRoute.POST(req);
  const body = await readResponseBody(res);
  assert.ok(body.includes('"role":"assistant"'));
  assert.ok(body.includes('"tool_calls"'));
  assert.ok(body.includes("hello"));
  assert.ok(body.includes('"usage"'));
  assert.ok(body.includes("[DONE]"));
});

test("chat completion stream failure returns 500", async () => {
  state.runWithDetailsError = true;
  const req = new NextRequest(
    new Request("http://localhost/api", { method: "POST", body: JSON.stringify({ messages: [], stream: true }) })
  );
  const res = await chatRoute.POST(req);
  assert.equal(res.status, 500);
  state.runWithDetailsError = false;
});

