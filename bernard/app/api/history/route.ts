import type { NextRequest } from "next/server";

import { getRedis } from "@/lib/redis";
import { RecordKeeper } from "@/lib/recordKeeper";
import { TokenStore } from "@/lib/tokenStore";

export const runtime = "nodejs";

function bearerToken(req: NextRequest) {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

export async function GET(req: NextRequest) {
  const token = bearerToken(req);
  if (!token) {
    return new Response(JSON.stringify({ error: "Missing bearer token" }), { status: 401 });
  }

  const store = new TokenStore(getRedis());
  const auth = await store.validate(token);
  if (!auth) {
    return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
  }

  const keeper = new RecordKeeper(getRedis());

  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get("conversationId") ?? undefined;
  const place = searchParams.get("place") ?? undefined;
  const keywordsRaw = searchParams.get("keywords") ?? undefined;
  const since = searchParams.get("since") ? Number(searchParams.get("since")) : undefined;
  const until = searchParams.get("until") ? Number(searchParams.get("until")) : undefined;
  const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined;
  const includeMessages = searchParams.get("includeMessages") === "true";
  const messageLimit = searchParams.get("messageLimit") ? Number(searchParams.get("messageLimit")) : undefined;

  const keywords = keywordsRaw
    ? keywordsRaw
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean)
    : undefined;

  const results = await keeper.recallConversation({
    conversationId,
    token,
    place,
    keywords,
    timeRange: { since, until },
    limit,
    includeMessages,
    messageLimit
  });

  return Response.json({ results });
}

export async function POST(req: NextRequest) {
  const token = bearerToken(req);
  if (!token) {
    return new Response(JSON.stringify({ error: "Missing bearer token" }), { status: 401 });
  }

  const store = new TokenStore(getRedis());
  const auth = await store.validate(token);
  if (!auth) {
    return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
  }

  let body: { conversationId?: string; token?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch (err) {
    return new Response(JSON.stringify({ error: "Invalid JSON", detail: String(err) }), {
      status: 400
    });
  }

  if (!body.conversationId) {
    return new Response(JSON.stringify({ error: "`conversationId` is required" }), { status: 400 });
  }

  const keeper = new RecordKeeper(getRedis());
  const convo = await keeper.reopenConversation(body.conversationId, body.token ?? token);
  if (!convo) {
    return new Response(JSON.stringify({ error: "Conversation not found" }), { status: 404 });
  }

  return Response.json({ conversation: convo });
}

