/**
 * ConversationRecordKeeper
 * 
 * Manages conversation recording and retrieval from Redis.
 * Handles conversation metadata, event logging, and user conversation indexing.
 */

import type Redis from "ioredis";
import { childLogger } from "@/lib/logging";
import type { ConversationEvent } from "./events";

/**
 * Configuration options for ConversationRecordKeeper
 */
interface ConversationRecordKeeperOptions {
  /** Redis namespace prefix (default: "bernard:conversation") */
  namespace?: string;
}

/**
 * Conversation metadata stored in Redis Hash
 */
export interface ConversationMetadata {
  /** Conversation UUID */
  id: string;
  /** Conversation name (empty by default) */
  name: string;
  /** Conversation description (empty by default) */
  description: string;
  /** User ID who owns this conversation */
  userId: string;
  /** Cached user name at conversation creation (empty if not set) */
  userName: string;
  /** ISO 8601 timestamp when conversation was created */
  createdAt: string;
  /** ISO 8601 timestamp of last event */
  lastTouchedAt: string;
  /** Soft delete flag */
  archived: boolean;
  /** ISO 8601 timestamp when archived (empty if not archived) */
  archivedAt: string;
  /** Total message count (user + assistant) */
  messageCount: number;
  /** Total tool call count */
  toolCallCount: number;
  /** Ghost mode flag */
  ghost: boolean;
  /** Error count */
  errorCount: number;
  /** ISO timestamp of last request (empty if not set) */
  lastRequestAt: string;
  /** Maximum single-turn latency in milliseconds (0 if not set) */
  maxTurnLatencyMs: number;
}

/**
 * Complete conversation with events
 */
export interface ConversationWithEvents {
  /** Conversation metadata */
  conversation: ConversationMetadata;
  /** Chronologically ordered events */
  events: ConversationEvent[];
}

/**
 * Result of listing conversations
 */
export interface ConversationListResult {
  /** List of conversation metadata */
  conversations: ConversationMetadata[];
  /** Total count of conversations in the set */
  total: number;
  /** Whether there are more results available */
  hasMore: boolean;
}

/**
 * ConversationRecordKeeper - Manages conversation recording in Redis
 */
export class ConversationRecordKeeper {
  private readonly namespace: string;
  private readonly log: ReturnType<typeof childLogger>;

  /**
   * Create a new ConversationRecordKeeper
   * @param redis - ioredis client instance
   * @param options - Configuration options
   */
  constructor(
    private readonly redis: Redis,
    options: ConversationRecordKeeperOptions = {}
  ) {
    this.namespace = options.namespace ?? "bernard:conversation";
    this.log = childLogger({ component: "conversation_recorder" });
  }

  /**
   * Build a namespaced Redis key
   */
  private key(suffix: string): string {
    return `${this.namespace}:${suffix}`;
  }

  /**
   * Generate a unique event ID
   */
  private generateEventId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 10);
    return `evt_${timestamp}_${random}`;
  }

  /**
   * Create a new conversation
   * @param conversationId - Unique conversation ID (UUID)
   * @param userId - User ID who owns this conversation
   * @param userName - Optional user name to cache
   * @param ghost - Optional ghost mode flag
   */
  async createConversation(
    conversationId: string,
    userId: string,
    userName?: string,
    ghost?: boolean
  ): Promise<ConversationMetadata> {
    const now = new Date().toISOString();
    const conversationKey = this.key(`conv:${conversationId}`);

    const conversation: ConversationMetadata = {
      id: conversationId,
      userId,
      userName: userName ?? "",
      name: "",
      description: "",
      createdAt: now,
      lastTouchedAt: now,
      archived: false,
      archivedAt: "",
      messageCount: 0,
      toolCallCount: 0,
      ghost: ghost ?? false,
      errorCount: 0,
      lastRequestAt: "",
      maxTurnLatencyMs: 0,
    };

    await this.redis.hset(conversationKey, {
      id: conversation.id,
      userId: conversation.userId,
      userName: conversation.userName ?? "",
      name: conversation.name ?? "",
      description: conversation.description ?? "",
      createdAt: conversation.createdAt,
      lastTouchedAt: conversation.lastTouchedAt,
      archived: "false",
      messageCount: "0",
      toolCallCount: "0",
      ghost: conversation.ghost ? "true" : "false",
    });

    await this.redis.zadd(
      this.key(`convs:user:${userId}:active`),
      Date.now(),
      conversationId
    );

    this.log.info({ conversationId, userId, userName }, "Conversation created");
    return conversation;
  }

  /**
   * Record an event to a conversation
   * @param conversationId - Conversation ID
   * @param event - Event to record
   */
  async recordEvent(
    conversationId: string,
    event: Omit<ConversationEvent, "id" | "timestamp">
  ): Promise<void> {
    const eventsKey = this.key(`conv:${conversationId}:events`);
    const conversationKey = this.key(`conv:${conversationId}`);

    const eventWithId: ConversationEvent = {
      ...event,
      id: this.generateEventId(),
      timestamp: new Date().toISOString(),
    } as ConversationEvent;

    await this.redis.rpush(eventsKey, JSON.stringify(eventWithId));

    await this.redis.hset(conversationKey, {
      lastTouchedAt: eventWithId.timestamp,
    });
    const userId = await this.getUserId(conversationId);
    if (userId) {
      await this.redis.zadd(
        this.key(`convs:user:${userId}:active`),
        Date.now(),
        conversationId
      );
    }

    this.log.debug(
      { conversationId, eventType: event.type, eventId: eventWithId.id },
      "Event recorded"
    );
  }

  /**
   * Get a conversation by ID
   * @param conversationId - Conversation ID
   * @returns Conversation with events, or null if not found
   */
  async getConversation(
    conversationId: string
  ): Promise<ConversationWithEvents | null> {
    const conversationKey = this.key(`conv:${conversationId}`);
    const eventsKey = this.key(`conv:${conversationId}:events`);

    const data = await this.redis.hgetall(conversationKey);
    if (!data || !data["id"]) {
      return null;
    }

    const eventsRaw = await this.redis.lrange(eventsKey, 0, -1);
    const events: ConversationEvent[] = eventsRaw.map((e) => {
      try {
        return JSON.parse(e) as ConversationEvent;
      } catch {
        this.log.warn({ event: e.slice(0, 100) }, "Failed to parse event");
        return null;
      }
    }).filter((e): e is ConversationEvent => e !== null);

    return {
      conversation: this.parseMetadata(data),
      events,
    };
  }

  /**
   * Get only conversation metadata (without events)
   * @param conversationId - Conversation ID
   * @returns Metadata or null if not found
   */
  async getConversationMetadata(
    conversationId: string
  ): Promise<ConversationMetadata | null> {
    const conversationKey = this.key(`conv:${conversationId}`);
    const data = await this.redis.hgetall(conversationKey);

    if (!data || !data["id"]) {
      return null;
    }

    return this.parseMetadata(data);
  }

  /**
   * Get events for a conversation
   * @param conversationId - Conversation ID
   * @returns Array of events in chronological order
   */
  async getEvents(
    conversationId: string
  ): Promise<ConversationEvent[]> {
    const eventsKey = this.key(`conv:${conversationId}:events`);
    const eventsRaw = await this.redis.lrange(eventsKey, 0, -1);

    return eventsRaw
      .map((e) => {
        try {
          return JSON.parse(e) as ConversationEvent;
        } catch {
          return null;
        }
      })
      .filter((e): e is ConversationEvent => e !== null);
  }

  /**
   * Get the user ID who owns a conversation
   * @param conversationId - Conversation ID
   * @returns User ID or null if conversation not found
   */
  async getUserId(conversationId: string): Promise<string | null> {
    const conversationKey = this.key(`conv:${conversationId}`);
    const userId = await this.redis.hget(conversationKey, "userId");
    return userId ?? null;
  }

  /**
   * Archive a conversation (soft delete)
   * @param conversationId - Conversation ID
   * @param userId - User requesting the archive (for authorization check)
   * @returns true if archived, false if not found or unauthorized
   */
  async archiveConversation(
    conversationId: string,
    userId: string
  ): Promise<boolean> {
    const conversationKey = this.key(`conv:${conversationId}`);
    const now = new Date().toISOString();

    const exists = await this.redis.exists(conversationKey);
    if (!exists) {
      return false;
    }

    const ownerId = await this.redis.hget(conversationKey, "userId");
    if (ownerId !== userId) {
      this.log.warn(
        { conversationId, ownerId, requester: userId },
        "Unauthorized archive attempt"
      );
      return false;
    }

    const multi = this.redis.multi();
    multi.hset(conversationKey, {
      archived: "true",
      archivedAt: now,
    });
    multi.zrem(this.key(`convs:user:${userId}:active`), conversationId);
    multi.zadd(this.key(`convs:user:${userId}:archived`), Date.now(), conversationId);

    await multi.exec();

    this.log.info({ conversationId, userId }, "Conversation archived");
    return true;
  }

  /**
   * Permanently delete a conversation
   * @param conversationId - Conversation ID
   * @param adminId - Admin user ID (must be admin to delete)
   * @returns true if deleted, false if not found or unauthorized
   */
  async deleteConversation(
    conversationId: string,
    adminId: string
  ): Promise<boolean> {
    const conversationKey = this.key(`conv:${conversationId}`);
    const eventsKey = this.key(`conv:${conversationId}:events`);

    const exists = await this.redis.exists(conversationKey);
    if (!exists) {
      return false;
    }

    const userId = await this.redis.hget(conversationKey, "userId");

    const multi = this.redis.multi();
    multi.del(conversationKey);
    multi.del(eventsKey);
    if (userId) {
      multi.zrem(this.key(`convs:user:${userId}:active`), conversationId);
      multi.zrem(this.key(`convs:user:${userId}:archived`), conversationId);
    }

    await multi.exec();

    this.log.info({ conversationId, adminId }, "Conversation deleted");
    return true;
  }

  /**
   * List conversations for a user
   * @param userId - User ID
   * @param options - Listing options
   * @returns List result with conversations and pagination info
   */
  async listConversations(
    userId: string,
    options: {
      /** Include archived conversations (default: false) */
      archived?: boolean;
      /** Maximum number of results (default: 50) */
      limit?: number;
      /** Pagination offset (default: 0) */
      offset?: number;
    } = {}
  ): Promise<ConversationListResult> {
    const { archived = false, limit = 50, offset = 0 } = options;

    const setKey = archived
      ? this.key(`convs:user:${userId}:archived`)
      : this.key(`convs:user:${userId}:active`);

    const conversationIds = await this.redis.zrevrange(
      setKey,
      offset,
      offset + limit - 1
    );

    const conversations = await Promise.all(
      conversationIds.map((id) => this.getConversationMetadata(id))
    );

    const validConversations = conversations.filter(
      (c): c is ConversationMetadata => c !== null
    );

    const total = await this.redis.zcard(setKey);

    return {
      conversations: validConversations,
      total,
      hasMore: offset + limit < total,
    };
  }

  /**
   * List all conversations across all users (admin only)
   * @param options - Listing options
   * @returns List result with conversations and pagination info
   */
  async listAllConversations(
    options: {
      /** Include archived conversations (default: false) */
      archived?: boolean;
      /** Maximum number of results (default: 50) */
      limit?: number;
      /** Pagination offset (default: 0) */
      offset?: number;
    } = {}
  ): Promise<ConversationListResult> {
    const { archived = false, limit = 50, offset = 0 } = options;

    const conversationIds: string[] = [];
    let cursor = "0";

    // Use SCAN to iterate through conversation keys
    do {
      const [newCursor, keys] = await this.redis.scan(
        cursor,
        "MATCH",
        `${this.namespace}:conv:*`,
        "COUNT",
        100
      );
      cursor = newCursor;

      // Extract conversation IDs from keys (format: namespace:conv:<id>)
      for (const key of keys) {
        const match = key.match(new RegExp(`${this.namespace}:conv:(.+)`));
        const convId = match?.[1];
        // Filter out event list keys by checking if it ends with :events
        if (convId && !convId.endsWith(":events")) {
          conversationIds.push(convId);
        }
      }
    } while (cursor !== "0");

    // Sort by lastTouchedAt descending (most recent first)
    const sortedConversations = await Promise.all(
      conversationIds
        .filter((id, index) => conversationIds.indexOf(id) === index) // Deduplicate
        .map((id) => this.getConversationMetadata(id))
    );

    const validConversations = sortedConversations
      .filter((c): c is ConversationMetadata => c !== null)
      .filter((c) => c.archived === archived)
      .sort((a, b) => {
        const aTime = new Date(a.lastTouchedAt).getTime();
        const bTime = new Date(b.lastTouchedAt).getTime();
        return bTime - aTime; // Descending order
      });

    // Apply pagination
    const paginatedConversations = validConversations.slice(offset, offset + limit);

    return {
      conversations: paginatedConversations,
      total: validConversations.length,
      hasMore: offset + limit < validConversations.length,
    };
  }

  /**
   * Update conversation metadata
   * @param conversationId - Conversation ID
   * @param updates - Fields to update
   */
  async updateConversation(
    conversationId: string,
    updates: Partial<Pick<ConversationMetadata, "name" | "description" | "ghost">>
  ): Promise<boolean> {
    const conversationKey = this.key(`conv:${conversationId}`);

    const exists = await this.redis.exists(conversationKey);
    if (!exists) {
      return false;
    }

    const setData: Record<string, string> = {};
    if (updates["name"] !== undefined) {
      setData["name"] = updates["name"];
    }
    if (updates["description"] !== undefined) {
      setData["description"] = updates["description"];
    }
    if (updates["ghost"] !== undefined) {
      setData["ghost"] = updates["ghost"] ? "true" : "false";
    }

    if (Object.keys(setData).length > 0) {
      setData["lastTouchedAt"] = new Date().toISOString();
      await this.redis.hset(conversationKey, setData);
    }

    return true;
  }

  /**
   * Check if a conversation exists
   * @param conversationId - Conversation ID
   */
  async conversationExists(conversationId: string): Promise<boolean> {
    const conversationKey = this.key(`conv:${conversationId}`);
    return (await this.redis.exists(conversationKey)) === 1;
  }

  /**
   * Parse raw Redis hash data into ConversationMetadata
   */
  private parseMetadata(data: Record<string, string>): ConversationMetadata {
    const parseIntSafely = (value: string | undefined, defaultValue: number): number => {
      if (value === undefined || value === "") return defaultValue;
      const parsed = parseInt(value, 10);
      return Number.isNaN(parsed) ? defaultValue : parsed;
    };

    const getString = (key: string, defaultValue = ""): string => {
      const value = data[key];
      return value && value.length > 0 ? value : defaultValue;
    };

    return {
      id: data["id"] ?? "",
      userId: data["userId"] ?? "",
      userName: getString("userName"),
      name: getString("name"),
      description: getString("description"),
      createdAt: data["createdAt"] ?? "",
      lastTouchedAt: data["lastTouchedAt"] ?? "",
      archived: data["archived"] === "true",
      archivedAt: getString("archivedAt"),
      messageCount: parseIntSafely(data["messageCount"], 0),
      toolCallCount: parseIntSafely(data["toolCallCount"], 0),
      ghost: data["ghost"] === "true",
      errorCount: parseIntSafely(data["errorCount"], 0),
      lastRequestAt: getString("lastRequestAt"),
      maxTurnLatencyMs: parseIntSafely(data["maxTurnLatencyMs"], 0),
    };
  }
}
