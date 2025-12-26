import assert from "node:assert/strict";
import { test } from "vitest";

import { NextRequest } from "next/server";

import { GET as listModels } from "../app/api/v1/models/route";
import { GET as getModel } from "../app/api/v1/models/[id]/route";
import { POST as embeddingsPost } from "../app/api/v1/embeddings/route";
import { POST as moderationsPost } from "../app/api/v1/moderations/route";
import { POST as chatPost } from "../app/api/v1/chat/completions/route";
import { POST as completionsPost } from "../app/api/v1/completions/route";

const makeNextRequest = (url: string, body: unknown, headers: Record<string, string> = {}, method = "POST") => {
  const req = new Request(url, {
    method,
    body: body ? JSON.stringify(body) : null,
    headers: { "content-type": "application/json", ...headers }
  });
  return new NextRequest(req);
};

test("models list only exposes bernard-v1", async () => {
  const res = listModels();
  const json = await res.json();
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(json.data));
  assert.equal(json.data.length, 1);
  assert.equal(json.data[0].id, "bernard-v1");
});

test("models/:id returns 404 for unknown", async () => {
  const res = await getModel(new NextRequest(new Request("http://localhost/api/v1/models/other")), {
    params: Promise.resolve({ id: "other" })
  });
  assert.equal(res.status, 404);
});

test("embeddings and moderations return 501", async () => {
  const emb = embeddingsPost();
  const mod = moderationsPost();
  assert.equal(emb.status, 501);
  assert.equal(mod.status, 501);
});

test("chat/completions requires bearer token", async () => {
  const req = makeNextRequest("http://localhost/api/v1/chat/completions", { messages: [] });
  const res = await chatPost(req);
  assert.equal(res.status, 401);
});

test("completions requires bearer token", async () => {
  const req = makeNextRequest("http://localhost/api/v1/completions", { prompt: "hi" });
  const res = completionsPost(req);
  assert.equal(res.status, 401);
});

