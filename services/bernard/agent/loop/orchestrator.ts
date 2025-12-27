import type { Recorder, MessageRecord } from "@/lib/conversation/types";
import type { RecordKeeper } from "@/agent/recordKeeper/conversation.keeper";
import { raiseEvent } from "@/lib/automation/hookService";
import { RouterContext, ResponseContext } from "@/lib/conversation/context";
import type { AgentOutputItem } from "../streaming/types";
import { runRouterHarness, getRouterToolDefinitions } from "../harness/router/routerHarness";
import type { LLMCaller } from "../llm/llm";
import type { BaseMessage } from "@langchain/core/messages";
import { AIMessage } from "@langchain/core/messages";
import { createDelegateSequencer } from "../streaming/delegateSequencer";
import { messageRecordToBaseMessage } from "@/lib/conversation/messages";
import type { HomeAssistantContextManager } from "@/lib/home-assistant";
import type { HARestConfig } from "../tool/home-assistant-list-entities.tool";
import type { PlexConfig } from "@/lib/plex";
import { getSettings } from "@/lib/config/settingsCache";
import { getRedis } from "@/lib/infra/redis";
import { TaskRecordKeeper } from "@/agent/recordKeeper/task.keeper";
import { enqueueTask } from "@/lib/task/queue";
import crypto from "node:crypto";

function uniqueId(prefix: string) {
    return `${prefix}_${crypto.randomBytes(10).toString("hex")}`;
}

export type OrchestratorInput = {
    conversationId?: string;
    incoming: BaseMessage[]; // User messages
    persistable: BaseMessage[]; // Messages to persist
    requestId?: string;
    turnId?: string;
    trace?: boolean; // Enable trace events
    abortSignal?: AbortSignal;
};

export type OrchestratorResult = {
    stream: AsyncIterable<AgentOutputItem>;
    result: Promise<{
        finalMessages: BaseMessage[];
        conversationId: string;
    }>;
};

export class StreamingOrchestrator {
    private currentLLMCallMessageId: string | undefined;
    private accumulatedDeltas: Map<string, string> = new Map();
    private usedTools: Set<string> = new Set();
    private haRestConfig?: HARestConfig;
    private plexConfig?: PlexConfig;

    constructor(
        private recordKeeper: RecordKeeper,
        private routerLLMCaller: LLMCaller,
        private responseLLMCaller: LLMCaller,
        private haContextManager?: HomeAssistantContextManager
    ) { }

    async run(input: OrchestratorInput): Promise<OrchestratorResult> {
        const {
            conversationId: providedId,
            persistable,
            requestId,
            turnId,
            trace = false,
            abortSignal
        } = input;

        // Reset instance fields to prevent state leakage between runs
        this.currentLLMCallMessageId = undefined;
        this.accumulatedDeltas.clear();
        this.usedTools.clear();

        // 1. Identify or create conversation
        const { conversationId } =
            await this.identifyConversation(providedId);

        // 2. Load HA REST configuration from settings
        const settings = await getSettings();
        if (settings.services.homeAssistant) {
            this.haRestConfig = {
                baseUrl: settings.services.homeAssistant.baseUrl,
                accessToken: settings.services.homeAssistant.accessToken
            };
        }

        // Load Plex configuration from settings
        if (settings.services.plex) {
            this.plexConfig = {
                baseUrl: settings.services.plex.baseUrl,
                token: settings.services.plex.token
            };
        }

        // 3. Initialize RecordKeeper with conversation
        const recorder = this.recordKeeper.asRecorder();
        const archivist = this.recordKeeper.asArchivist();

        // 4. Get conversation metadata for task context
        const conversation = await archivist.getConversation(conversationId);
        const userId = conversation?.userId || "";

        // 5. Create task creation context
        const taskRecordKeeper = new TaskRecordKeeper(getRedis());
        const createTask = async (toolName: string, args: Record<string, unknown>, settings: Record<string, unknown>) => {
          const taskId = `task_${crypto.randomBytes(10).toString("hex")}`;
          const taskName = `${toolName}: ${Object.values(args).join(" (")}...)`.slice(0, 100);

          await taskRecordKeeper.createTask(taskId, {
            name: taskName,
            toolName,
            userId,
            conversationId,
            sections: {
              execution_log: "Task execution log",
              metadata: "Task metadata and results"
            }
          });

          const taskPayload = {
            taskId,
            toolName,
            arguments: args,
            settings,
            userId,
            conversationId
          };

          await enqueueTask(taskId, taskPayload);

          return { taskId, taskName };
        };

        const taskContext = {
          conversationId,
          userId,
          createTask
        };

        // 6. Get tool definitions

        // 5. Get tool definitions
        const { langChainTools } = getRouterToolDefinitions(this.haContextManager, this.haRestConfig, this.plexConfig, taskContext);

        // 5. Create contexts
        const routerContext = new RouterContext(
          langChainTools.map(tool => ({ name: tool.name, description: tool.description, schema: tool.schema }))
        );
        const responseContext = new ResponseContext(
          langChainTools.map(tool => ({ name: tool.name, description: tool.description })),
          undefined, // disabledTools
          langChainTools,
          [] // usedTools
        );

        // Register contexts for automatic updates
        this.recordKeeper.registerContext(conversationId, routerContext);
        this.recordKeeper.registerContext(conversationId, responseContext);

        // 6. Sync history with deduplication and proper placement
        await recorder.syncHistory(conversationId, persistable);

        // 7. Initialize contexts with full history (existing + synced)
        const fullHistory = await archivist.getMessages(conversationId);
        routerContext.initializeWithHistory(fullHistory);
        responseContext.initializeWithHistory(fullHistory);

        // 5. Create event sequencer
        const sequencer = createDelegateSequencer<AgentOutputItem>();

        // 7. Run Recollection Harness
        const recollectionStream = (async function* (this: StreamingOrchestrator) {
            const { runRecollectionHarness } = await import("../harness/recollect");
            const recollectionHarness = runRecollectionHarness({
                conversationId,
                routerContext,
                messages: persistable, // Pass the incoming messages
                recordKeeper: this.recordKeeper
            });

            for await (const event of recollectionHarness) {
                // Record recollection events via Recorder
                await this.recordEvent(recorder, conversationId, event, requestId, turnId);

                // Yield filtered recollection events
                if (this.shouldEmitEvent(event, trace)) {
                    yield event;
                }
            }
        }).bind(this)();

        // 8. Run Router Harness (now includes response harness execution)
        const routerStream = (async function* (this: StreamingOrchestrator) {
            const routerHarness = runRouterHarness({
                conversationId,
                routerContext,
                responseContext,
                messages: persistable, // Pass the incoming messages for initial processing
                llmCaller: this.routerLLMCaller,
                responseLLMCaller: this.responseLLMCaller,
                toolDefinitions: langChainTools,
                usedTools: [],
                ...(this.haContextManager ? { haContextManager: this.haContextManager } : {}),
                ...(this.haRestConfig ? { haRestConfig: this.haRestConfig } : {}),
                ...(this.plexConfig ? { plexConfig: this.plexConfig } : {}),
                ...(abortSignal ? { abortSignal } : {}),
                ...(taskContext ? { taskContext } : {})
            });

            for await (const event of routerHarness) {
                // Record events via Recorder
                await this.recordEvent(recorder, conversationId, event, requestId, turnId);

                // Yield filtered events
                if (this.shouldEmitEvent(event, trace)) {
                    yield event;
                }
            }
        }).bind(this)();

        // Chain recollection stream first, then router stream
        sequencer.chain(recollectionStream);
        sequencer.chain(routerStream);
        sequencer.done();

        // 7. Build result promise
        let resolveResult: (value: { finalMessages: BaseMessage[]; conversationId: string }) => void;
        const resultPromise = new Promise<{ finalMessages: BaseMessage[]; conversationId: string }>((resolve) => {
            resolveResult = resolve;
        });

        // Collect final messages as stream processes
        const finalMessages: BaseMessage[] = [];
        const outputStream = (async function* (this: StreamingOrchestrator) {
            for await (const event of sequencer.sequence) {
                if (event.type === "delta" && event.finishReason) {
                    const content = this.accumulatedDeltas.get(event.messageId) || "";
                    finalMessages.push(new AIMessage({ content, id: event.messageId }));
                }
                yield event;
            }

            resolveResult({
                finalMessages,
                conversationId
            });
        }).bind(this)();

        return {
            stream: outputStream,
            result: resultPromise
        };
    }

    private async identifyConversation(providedId: string | undefined): Promise<{
        conversationId: string;
        isNewConversation: boolean;
        existingHistory?: MessageRecord[];
    }> {
        if (providedId) {
            const existing = await this.recordKeeper.getConversation(providedId);
            if (existing) {
                const history = await this.recordKeeper.getMessages(providedId);
                return {
                    conversationId: providedId,
                    isNewConversation: false,
                    existingHistory: history
                };
            }
        }

        // Create new conversation
        const newId = uniqueId("conv");
        return {
            conversationId: newId,
            isNewConversation: true
        };
    }

    private mergeHistory(
        _conversationId: string,
        newMessages: BaseMessage[],
        existingHistory: MessageRecord[]
    ): BaseMessage[] {
        // This is a simplified merge.
        const history = existingHistory.map((msg) => messageRecordToBaseMessage(msg)).filter((m): m is BaseMessage => m !== null);
        return [
            ...history,
            ...newMessages
        ];
    }

    private async recordEvent(
        recorder: Recorder,
        conversationId: string,
        event: AgentOutputItem,
        requestId?: string,
        turnId?: string
    ): Promise<void> {
        switch (event.type) {
            case "llm_call":
                this.currentLLMCallMessageId = uniqueId("msg");
                await recorder.recordLLMCallStart(conversationId, {
                    messageId: this.currentLLMCallMessageId,
                    model: event.model || "unknown",
                    context: event.context,
                    ...(requestId ? { requestId } : {}),
                    ...(turnId ? { turnId } : {}),
                    ...(event.tools ? { tools: event.tools } : {}),
                });
                break;

            case "llm_call_complete":
                if (this.currentLLMCallMessageId) {
                    const llmCompleteDetails: {
                        messageId: string;
                        result: BaseMessage;
                        latencyMs?: number;
                        tokens?: { in: number; out: number };
                    } = {
                        messageId: this.currentLLMCallMessageId,
                        result: event.result,
                        ...(event.actualTokens ? {
                            tokens: {
                                in: event.actualTokens.promptTokens,
                                out: event.actualTokens.completionTokens
                            }
                        } : {}),
                    };

                    if (event.type === "llm_call_complete" && event.latencyMs !== undefined) {
                        llmCompleteDetails.latencyMs = event.latencyMs;
                    }

                    await recorder.recordLLMCallComplete(conversationId, llmCompleteDetails);

                    // Raise assistant_message_complete event for automation hooks
                    try {
                        // Check if this is an assistant message (AIMessage)
                        if (event.result && event.result instanceof AIMessage) {
                            const aiMessage = event.result;
                            const conversation = await (recorder as RecordKeeper).getConversation(conversationId);

                            if (conversation) {
                                // Get the last user message for context
                                const messages = await (recorder as RecordKeeper).getMessages(conversationId);
                                const lastUserMessage = messages
                                  .filter(m => m.role === "user")
                                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

                                await raiseEvent("assistant_message_complete", {
                                  conversationId,
                                  userId: conversation.userId ?? "",
                                  messageContent: typeof aiMessage.content === "string" ? aiMessage.content : JSON.stringify(aiMessage.content),
                                  userMessageContent: lastUserMessage?.content as string ?? ""
                                });
                            }
                        }
                    } catch (err) {
                        // Log but don't fail the main operation
                        console.warn("Failed to raise assistant_message_complete event:", err);
                    }
                }
                break;

            case "tool_call":
                this.usedTools.add(event.toolCall.function.name);
                await recorder.recordToolCallStart(conversationId, {
                    toolCallId: event.toolCall.id,
                    toolName: event.toolCall.function.name,
                    arguments: event.toolCall.function.arguments,
                    ...(this.currentLLMCallMessageId ? { messageId: this.currentLLMCallMessageId } : {})
                });
                break;

            case "tool_call_complete": {
                const toolCompleteDetails: {
                    toolCallId: string;
                    result: string;
                    latencyMs?: number;
                } = {
                    toolCallId: event.toolCall.id,
                    result: event.result
                };

                if (event.type === "tool_call_complete" && event.latencyMs !== undefined) {
                    toolCompleteDetails.latencyMs = event.latencyMs;
                }

                await recorder.recordToolCallComplete(conversationId, toolCompleteDetails);
                break;
            }

            case "delta": {
                const current = this.accumulatedDeltas.get(event.messageId) || "";
                const next = current + event.delta;
                this.accumulatedDeltas.set(event.messageId, next);

                if (event.finishReason) {
                    await recorder.recordMessage(conversationId, new AIMessage({
                        content: next,
                        id: event.messageId
                    }));
                }
                break;
            }

            case "recollection": {
                const recollectionDetails: {
                    recollectionId: string;
                    sourceConversationId: string;
                    chunkIndex: number;
                    content: string;
                    score: number;
                    messageStartIndex: number;
                    messageEndIndex: number;
                    conversationMetadata?: Record<string, unknown>;
                } = {
                    recollectionId: event.recollectionId,
                    sourceConversationId: event.conversationId,
                    chunkIndex: event.chunkIndex,
                    content: event.content,
                    score: event.score,
                    messageStartIndex: event.messageStartIndex,
                    messageEndIndex: event.messageEndIndex
                };
                if (event.conversationMetadata) {
                    recollectionDetails.conversationMetadata = event.conversationMetadata as Record<string, unknown>;
                }
                await recorder.recordRecollection(conversationId, recollectionDetails);
                break;
            }
        }
    }

    private shouldEmitEvent(event: AgentOutputItem, trace: boolean): boolean {
        if (event.type === "delta" || event.type === "error") {
            return true;
        }

        if (trace) {
            return (
                event.type === "llm_call" ||
                event.type === "llm_call_complete" ||
                event.type === "tool_call" ||
                event.type === "tool_call_complete" ||
                event.type === "recollection"
            );
        }

        return false;
    }

    /**
     * Cleanup resources when shutting down the orchestrator
     */
    async shutdown(): Promise<void> {
        console.warn('[StreamingOrchestrator] Shutting down...');

        // Close all Home Assistant WebSocket connections
        try {
            const { closeAllHAConnections } = await import('@/lib/home-assistant');
            closeAllHAConnections();
            console.warn('[StreamingOrchestrator] Closed all HA WebSocket connections');
        } catch (error) {
            console.warn('[StreamingOrchestrator] Error closing HA connections:', error);
        }

        // Close vector Redis client
        try {
            const { cleanupVectorClient } = await import('@/lib/conversation/search');
            await cleanupVectorClient();
            console.warn('[StreamingOrchestrator] Closed vector Redis client');
        } catch (error) {
            console.warn('[StreamingOrchestrator] Error closing vector Redis client:', error);
        }

        // Note: Other cleanup logic (LLM callers, record keepers, etc.) should be handled by their respective owners
    }
}
