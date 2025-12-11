import type { NextRequest } from "next/server";

import { requireAdmin, SessionStore, TokenStore, UserStore } from "@/lib/auth";
import { RecordKeeper, type MessageRecord } from "@/lib/conversation/recordKeeper";
import { getRedis } from "@/lib/infra/redis";

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
  errorCount?: number;
  hasErrors?: boolean;
  userAssistantCount?: number;
  maxTurnLatencyMs?: number;
};

async function buildAdminConversation(
  keeper: RecordKeeper,
  tokens: TokenStore,
  sessions: SessionStore,
  users: UserStore,
  id: string,
  messageLimit?: number
): Promise<{ conversation: AdminConversationDetail; messages: MessageRecord[] } | null> {
  const result = await keeper.getConversationWithMessages(id, messageLimit);
  if (!result) return null;

  const tokenNames: string[] = [];
  const tokenIds: string[] = [];
  const tokenSet = result.conversation.tokenSet ?? [];

  const resolveToken = async (token: string) => {
    const resolvedToken = await tokens.resolve(token);
    if (resolvedToken) {
      return { id: resolvedToken.id, name: resolvedToken.name };
    }
    const session = await sessions.get(token);
    if (session) {
      const user = await users.get(session.userId);
      if (user && user.status === "active") {
        return { id: user.id, name: user.displayName };
      }
    }
    return null;
  };

  for (const token of tokenSet) {
    const resolved = await resolveToken(token);
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
    messageCount: result.conversation.userAssistantCount ?? result.conversation.messageCount ?? result.messages.length,
    userAssistantCount: result.conversation.userAssistantCount ?? result.conversation.messageCount ?? result.messages.length,
    toolCallCount: result.conversation.toolCallCount ?? 0,
    tags: result.conversation.tags ?? [],
    source,
    tokenNames,
    tokenIds,
    ...(result.conversation.errorCount !== undefined ? { errorCount: result.conversation.errorCount } : {}),
    hasErrors: result.conversation.hasErrors ?? (result.conversation.errorCount ?? 0) > 0,
    ...(result.conversation.maxTurnLatencyMs !== undefined
      ? { maxTurnLatencyMs: result.conversation.maxTurnLatencyMs }
      : {})
  };

  if (result.conversation.summary !== undefined) conversation.summary = result.conversation.summary;
  if (result.conversation.closedAt !== undefined) conversation.closedAt = result.conversation.closedAt;
  if (result.conversation.flags !== undefined) conversation.flags = result.conversation.flags;
  if (result.conversation.modelSet !== undefined) conversation.modelSet = result.conversation.modelSet;
  if (result.conversation.placeTags !== undefined) conversation.placeTags = result.conversation.placeTags;
  if (result.conversation.keywords !== undefined) conversation.keywords = result.conversation.keywords;
  if (result.conversation.closeReason !== undefined) conversation.closeReason = result.conversation.closeReason;
  if (result.conversation.requestCount !== undefined) conversation.requestCount = result.conversation.requestCount;

  return { conversation, messages: result.messages };
}

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
  const sessions = new SessionStore(redis);
  const users = new UserStore(redis);

  try {
    const payload = await buildAdminConversation(keeper, tokens, sessions, users, id, limit);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Conversation not found" }), { status: 404 });
    }
    return Response.json(payload);
  } catch (err) {
    console.error(`Failed to load conversation ${id}`, err);
    return new Response(JSON.stringify({ error: "Unable to load conversation" }), { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
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
  const sessions = new SessionStore(redis);
  const users = new UserStore(redis);

  let body: { ttl?: number; reason?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  if (body.ttl !== 0) {
    return new Response(JSON.stringify({ error: "ttl must be 0 to close conversation" }), { status: 400 });
  }

  const reason = body.reason ?? "manual";

  try {
    await keeper.closeConversation(id, reason);
    const payload = await buildAdminConversation(keeper, tokens, sessions, users, id, limit);
    if (!payload) {
      return new Response(JSON.stringify({ error: "Conversation not found" }), { status: 404 });
    }
    return Response.json(payload);
  } catch (err) {
    console.error(`Failed to close conversation ${id}`, err);
    return new Response(JSON.stringify({ error: "Unable to close conversation" }), { status: 500 });
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

