import type { NextRequest } from "next/server";

import { validateAccessToken } from "@/lib/auth";
import { RecordKeeper } from "@/lib/conversation/recordKeeper";
import { getRedis } from "@/lib/infra/redis";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await validateAccessToken(req);
  if ("error" in auth) return auth.error;
  const token = auth.access.token;

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

  const timeRange: { since?: number; until?: number } = {};
  if (since !== undefined) timeRange.since = since;
  if (until !== undefined) timeRange.until = until;

  const recallArgs: {
    conversationId?: string;
    token: string;
    place?: string;
    keywords?: string[];
    timeRange?: { since?: number; until?: number };
    limit?: number;
    includeMessages?: boolean;
    messageLimit?: number;
  } = { token, includeMessages };
  if (place) recallArgs.place = place;
  if (keywords) recallArgs.keywords = keywords;
  if (typeof limit === "number") recallArgs.limit = limit;
  if (typeof messageLimit === "number") recallArgs.messageLimit = messageLimit;
  if (conversationId) recallArgs.conversationId = conversationId;
  if (Object.keys(timeRange).length) recallArgs.timeRange = timeRange;

  const results = await keeper.recallConversation(recallArgs);

  return Response.json({ results });
}

export async function POST(req: NextRequest) {
  const auth = await validateAccessToken(req);
  if ("error" in auth) return auth.error;
  const token = auth.access.token;

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

