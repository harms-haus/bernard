import type { NextRequest } from "next/server";

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

function isAdmin(req: NextRequest) {
  const adminKey = process.env["ADMIN_API_KEY"];
  if (!adminKey) return false;
  const header = req.headers.get("authorization");
  if (!header) return false;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token === adminKey;
}

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) {
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
    const conversations = await keeper.listConversations({ limit, includeOpen, includeClosed });

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

      items.push({
        id: conversation.id,
        status: conversation.status,
        summary: conversation.summary,
        startedAt: conversation.startedAt,
        lastTouchedAt: conversation.lastTouchedAt,
        closedAt: conversation.closedAt,
        lastRequestAt: conversation.lastRequestAt ?? conversation.lastTouchedAt,
        messageCount: conversation.messageCount ?? 0,
        toolCallCount: conversation.toolCallCount ?? 0,
        requestCount: conversation.requestCount,
        tags: conversation.tags ?? [],
        flags: conversation.flags,
        modelSet: conversation.modelSet,
        placeTags: conversation.placeTags,
        keywords: conversation.keywords,
        closeReason: conversation.closeReason,
        source,
        tokenNames,
        tokenIds
      });
    }

    const activeCount = items.filter((item) => item.status === "open").length;
    const closedCount = items.filter((item) => item.status === "closed").length;

    return Response.json({ items, total: items.length, activeCount, closedCount });
  } catch (err) {
    console.error("Failed to list admin history", err);
    return new Response(JSON.stringify({ error: "Unable to list history" }), { status: 500 });
  }
}

