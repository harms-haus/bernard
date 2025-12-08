import type { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { RecordKeeper } from "@/lib/recordKeeper";
import { getRedis } from "@/lib/redis";
import { TokenStore } from "@/lib/tokenStore";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

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

export async function GET(req: NextRequest, { params }: RouteParams) {
  if (!(await requireAdmin(req))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const messageLimit = searchParams.get("messageLimit");
  const parsedLimit = messageLimit ? Number(messageLimit) : undefined;
  const limit = Number.isFinite(parsedLimit) && parsedLimit !== 0 ? parsedLimit : undefined;

  const redis = getRedis();
  const keeper = new RecordKeeper(redis);
  const tokens = new TokenStore(redis);

  try {
    const result = await keeper.getConversationWithMessages(id, limit);
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
      startedAt: result.conversation.startedAt,
      lastTouchedAt: result.conversation.lastTouchedAt,
      lastRequestAt: result.conversation.lastRequestAt ?? result.conversation.lastTouchedAt,
      messageCount: result.conversation.messageCount ?? result.messages.length,
      toolCallCount: result.conversation.toolCallCount ?? 0,
      tags: result.conversation.tags ?? [],
      source,
      tokenNames,
      tokenIds
    };

    if (result.conversation.summary !== undefined) conversation.summary = result.conversation.summary;
    if (result.conversation.closedAt !== undefined) conversation.closedAt = result.conversation.closedAt;
    if (result.conversation.flags !== undefined) conversation.flags = result.conversation.flags;
    if (result.conversation.modelSet !== undefined) conversation.modelSet = result.conversation.modelSet;
    if (result.conversation.placeTags !== undefined) conversation.placeTags = result.conversation.placeTags;
    if (result.conversation.keywords !== undefined) conversation.keywords = result.conversation.keywords;
    if (result.conversation.closeReason !== undefined) conversation.closeReason = result.conversation.closeReason;
    if (result.conversation.requestCount !== undefined) conversation.requestCount = result.conversation.requestCount;

    return Response.json({
      conversation,
      messages: result.messages
    });
  } catch (err) {
    console.error(`Failed to load conversation ${id}`, err);
    return new Response(JSON.stringify({ error: "Unable to load conversation" }), { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  if (!(await requireAdmin(req))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { id } = await params;
  const redis = getRedis();
  const keeper = new RecordKeeper(redis);

  try {
    const removed = await keeper.deleteConversation(id);
    if (!removed) {
      return new Response(JSON.stringify({ error: "Conversation not found" }), { status: 404 });
    }
    return Response.json({ removed: true });
  } catch (err) {
    console.error(`Failed to delete conversation ${id}`, err);
    return new Response(JSON.stringify({ error: "Unable to delete conversation" }), { status: 500 });
  }
}

