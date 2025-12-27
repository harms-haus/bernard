import type { NextRequest } from "next/server";

import { requireAdminRequest } from "@/app/api/_lib/admin";
import { SessionStore, TokenStore, UserStore } from "@/lib/auth";
import { RecordKeeper, type MessageRecord } from "@/agent/recordKeeper/conversation.keeper";
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
  ghost?: boolean;
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
      : {}),
    ...(result.conversation.ghost !== undefined ? { ghost: result.conversation.ghost } : {})
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
  const auth = await requireAdminRequest(req, { route: "/api/admin/history/[id]" });
  if ("error" in auth) return auth.error;

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
      auth.reqLog.failure(404, "conversation_not_found", { action: "admin.history.detail", conversationId: id });
      return new Response(JSON.stringify({ error: "Conversation not found" }), { status: 404 });
    }
    auth.reqLog.success(200, {
      action: "admin.history.detail",
      adminId: auth.admin.user.id,
      conversationId: id,
      includeMessages: Boolean(limit),
      messageLimit: limit ?? null
    });
    return Response.json(payload);
  } catch (err) {
    auth.reqLog.failure(500, err, { action: "admin.history.detail", conversationId: id });
    return new Response(JSON.stringify({ error: "Unable to load conversation" }), { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAdminRequest(req, { route: "/api/admin/history/[id]" });
  if ("error" in auth) return auth.error;

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
      auth.reqLog.failure(404, "conversation_not_found", { action: "admin.history.close", conversationId: id });
      return new Response(JSON.stringify({ error: "Conversation not found" }), { status: 404 });
    }
    auth.reqLog.success(200, {
      action: "admin.history.close",
      adminId: auth.admin.user.id,
      conversationId: id,
      reason
    });
    return Response.json(payload);
  } catch (err) {
    auth.reqLog.failure(500, err, { action: "admin.history.close", conversationId: id });
    return new Response(JSON.stringify({ error: "Unable to close conversation" }), { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAdminRequest(req, { route: "/api/admin/history/[id]" });
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const redis = getRedis();
  const keeper = new RecordKeeper(redis);

  try {
    const removed = await keeper.deleteConversation(id);
    if (!removed) {
      auth.reqLog.failure(404, "conversation_not_found", { action: "admin.history.delete", conversationId: id });
      return new Response(JSON.stringify({ error: "Conversation not found" }), { status: 404 });
    }
    auth.reqLog.success(200, {
      action: "admin.history.delete",
      adminId: auth.admin.user.id,
      conversationId: id
    });
    return Response.json({ removed: true });
  } catch (err) {
    auth.reqLog.failure(500, err, { action: "admin.history.delete", conversationId: id });
    return new Response(JSON.stringify({ error: "Unable to delete conversation" }), { status: 500 });
  }
}

