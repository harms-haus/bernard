import type { NextRequest } from "next/server";

import { RecordKeeper } from "@/lib/recordKeeper";
import { getRedis } from "@/lib/redis";
import { TokenStore } from "@/lib/tokenStore";

export const runtime = "nodejs";

type AdminConversationDetail = {
  id: string;
  status: "open" | "closed";
  summary?: string;
  startedAt: string;
  lastTouchedAt: string;
  closedAt?: string;
  lastRequestAt?: string;
  messageCount: number;
  toolCallCount: number;
  requestCount?: number;
  tags: string[];
  flags?: { explicit?: boolean; forbidden?: boolean; summaryError?: boolean | string };
  modelSet?: string[];
  placeTags?: string[];
  keywords?: string[];
  closeReason?: string;
  source: string;
  tokenNames: string[];
  tokenIds: string[];
};

function isAdmin(req: NextRequest) {
  const adminKey = process.env["ADMIN_API_KEY"];
  if (!adminKey) return false;
  const header = req.headers.get("authorization");
  if (!header) return false;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token === adminKey;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdmin(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const messageLimit = searchParams.get("messageLimit");
  const parsedLimit = messageLimit ? Number(messageLimit) : undefined;
  const limit = Number.isFinite(parsedLimit) && parsedLimit !== 0 ? parsedLimit : undefined;

  const redis = getRedis();
  const keeper = new RecordKeeper(redis);
  const tokens = new TokenStore(redis);

  try {
    const result = await keeper.getConversationWithMessages(params.id, limit);
    if (!result) {
      return new Response(JSON.stringify({ error: "Conversation not found" }), { status: 404 });
    }

    const tokenNames: string[] = [];
    const tokenIds: string[] = [];
    const tokenSet = result.conversation.tokenSet ?? [];
    for (const token of tokenSet) {
      const resolved = await tokens.resolve(token);
      if (!resolved) continue;
      tokenIds.push(resolved.id);
      if (!tokenNames.includes(resolved.name)) {
        tokenNames.push(resolved.name);
      }
    }

    const source = tokenNames[0] ?? "Unknown token";

    const conversation: AdminConversationDetail = {
      id: result.conversation.id,
      status: result.conversation.status,
      summary: result.conversation.summary,
      startedAt: result.conversation.startedAt,
      lastTouchedAt: result.conversation.lastTouchedAt,
      closedAt: result.conversation.closedAt,
      lastRequestAt: result.conversation.lastRequestAt ?? result.conversation.lastTouchedAt,
      messageCount: result.conversation.messageCount ?? result.messages.length,
      toolCallCount: result.conversation.toolCallCount ?? 0,
      requestCount: result.conversation.requestCount,
      tags: result.conversation.tags ?? [],
      flags: result.conversation.flags,
      modelSet: result.conversation.modelSet,
      placeTags: result.conversation.placeTags,
      keywords: result.conversation.keywords,
      closeReason: result.conversation.closeReason,
      source,
      tokenNames,
      tokenIds
    };

    return Response.json({
      conversation,
      messages: result.messages
    });
  } catch (err) {
    console.error(`Failed to load conversation ${params.id}`, err);
    return new Response(JSON.stringify({ error: "Unable to load conversation" }), { status: 500 });
  }
}

