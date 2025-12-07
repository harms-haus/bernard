import type { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { RecordKeeper } from "@/lib/recordKeeper";
import { getRedis } from "@/lib/redis";
import { TokenStore } from "@/lib/tokenStore";

export const runtime = "nodejs";

type AdminConversation = {
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

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limitParam = searchParams.get("limit");
  const includeOpen = searchParams.get("includeOpen") !== "false";
  const includeClosed = searchParams.get("includeClosed") !== "false";
  const limit = limitParam ? Number(limitParam) : undefined;

  const redis = getRedis();
  const keeper = new RecordKeeper(redis);
  const tokens = new TokenStore(redis);

  try {
    await keeper.closeIfIdle();
    const conversations = await keeper.listConversations({
      includeOpen,
      includeClosed,
      ...(limit !== undefined ? { limit } : {})
    });

    const tokenCache = new Map<string, { id: string; name: string }>();

    const items: AdminConversation[] = [];
    for (const conversation of conversations) {
      const tokenNames: string[] = [];
      const tokenIds: string[] = [];

      const tokenSet = conversation.tokenSet ?? [];
      for (const token of tokenSet) {
        if (!tokenCache.has(token)) {
          const resolved = await tokens.resolve(token);
          if (resolved) {
            tokenCache.set(token, { id: resolved.id, name: resolved.name });
          }
        }
        const resolved = tokenCache.get(token);
        if (resolved) {
          tokenIds.push(resolved.id);
          if (!tokenNames.includes(resolved.name)) {
            tokenNames.push(resolved.name);
          }
        }
      }

      const source = tokenNames[0] ?? "Unknown token";

      const item: AdminConversation = {
        id: conversation.id,
        status: conversation.status,
        startedAt: conversation.startedAt,
        lastTouchedAt: conversation.lastTouchedAt,
        lastRequestAt: conversation.lastRequestAt ?? conversation.lastTouchedAt,
        messageCount: conversation.messageCount ?? 0,
        toolCallCount: conversation.toolCallCount ?? 0,
        tags: conversation.tags ?? [],
        source,
        tokenNames,
        tokenIds
      };

      if (conversation.summary !== undefined) item.summary = conversation.summary;
      if (conversation.closedAt !== undefined) item.closedAt = conversation.closedAt;
      if (conversation.flags !== undefined) item.flags = conversation.flags;
      if (conversation.modelSet !== undefined) item.modelSet = conversation.modelSet;
      if (conversation.placeTags !== undefined) item.placeTags = conversation.placeTags;
      if (conversation.keywords !== undefined) item.keywords = conversation.keywords;
      if (conversation.closeReason !== undefined) item.closeReason = conversation.closeReason;
      if (conversation.requestCount !== undefined) item.requestCount = conversation.requestCount;

      items.push(item);
    }

    const activeCount = items.filter((item) => item.status === "open").length;
    const closedCount = items.filter((item) => item.status === "closed").length;

    return Response.json({ items, total: items.length, activeCount, closedCount });
  } catch (err) {
    console.error("Failed to list admin history", err);
    return new Response(JSON.stringify({ error: "Unable to list history" }), { status: 500 });
  }
}

