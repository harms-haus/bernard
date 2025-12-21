import type { Archivist, Recorder, MessageRecord } from "@/lib/conversation/types";
import { RecordKeeper } from "@/lib/conversation/recordKeeper";
import type { AgentOutputItem } from "../streaming/types";
import { runRouterHarness, getRouterToolDefinitions } from "../harness/router/routerHarness";
import { runResponseHarness } from "../harness/respond/responseHarness";
import type { LLMCaller } from "../llm/llm";
import { AIMessage, BaseMessage } from "@langchain/core/messages";
import { createDelegateSequencer } from "../streaming/delegateSequencer";
import { messageRecordToBaseMessage } from "@/lib/conversation/messages";
import { deduplicateMessages } from "@/lib/conversation/dedup";
import type { HomeAssistantContextManager } from "../harness/router/tools/ha-context";
import type { ToolWithInterpretation } from "../harness/router/tools";
import type { HARestConfig } from "../harness/router/tools/ha-list-entities";
import { getSettings } from "@/lib/config/settingsCache";
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
        const { conversationId, isNewConversation, existingHistory } =
            await this.identifyConversation(providedId);

        // 2. Load HA REST configuration from settings
        const settings = await getSettings();
        if (settings.services.homeAssistant) {
            this.haRestConfig = {
                baseUrl: settings.services.homeAssistant.baseUrl,
                accessToken: settings.services.homeAssistant.accessToken
            };
        }

        // 3. Initialize RecordKeeper with conversation
        const recorder = this.recordKeeper.asRecorder();
        const archivist = this.recordKeeper.asArchivist();

        // Sync history with deduplication and proper placement
        await recorder.syncHistory(conversationId, persistable);

        // 4. Get tool definitions
        const { langChainTools } = getRouterToolDefinitions(this.haContextManager, this.haRestConfig);

        // 5. Create event sequencer
        const sequencer = createDelegateSequencer<AgentOutputItem>();

        // 6. Run Router Harness (now includes response harness execution)
        const routerStream = (async function* (this: StreamingOrchestrator) {
            const routerHarness = runRouterHarness({
                conversationId,
                messages: persistable, // Pass the full incoming context as the "history"
                llmCaller: this.routerLLMCaller,
                responseLLMCaller: this.responseLLMCaller,
                archivist,
                skipHistory: true, // Don't fetch the historical record from the database
                toolDefinitions: langChainTools,
                usedTools: [],
                ...(this.haContextManager ? { haContextManager: this.haContextManager } : {}),
                ...(this.haRestConfig ? { haRestConfig: this.haRestConfig } : {}),
                ...(abortSignal ? { abortSignal } : {})
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

    private async mergeHistory(
        _conversationId: string,
        newMessages: BaseMessage[],
        existingHistory: MessageRecord[]
    ): Promise<BaseMessage[]> {
        // This is a simplified merge.
        return [
            ...existingHistory.map((msg) => messageRecordToBaseMessage(msg)).filter((m): m is BaseMessage => m !== null),
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
                    context: event.context as BaseMessage[],
                    ...(requestId ? { requestId } : {}),
                    ...(turnId ? { turnId } : {}),
                    ...(event.tools ? { tools: event.tools } : {}),
                });
                break;

            case "llm_call_complete":
                if (this.currentLLMCallMessageId) {
                    await recorder.recordLLMCallComplete(conversationId, {
                        messageId: this.currentLLMCallMessageId,
                        result: event.result,
                    });
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

            case "tool_call_complete":
                await recorder.recordToolCallComplete(conversationId, {
                    toolCallId: event.toolCall.id,
                    result: event.result
                });
                break;

            case "delta":
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
                event.type === "tool_call_complete"
            );
        }

        return false;
    }

    /**
     * Cleanup resources when shutting down the orchestrator
     */
    async shutdown(): Promise<void> {
        console.log('[StreamingOrchestrator] Shutting down...');

        // Close all Home Assistant WebSocket connections
        try {
            const { closeAllHAConnections } = await import('../harness/router/tools/ha-websocket-client');
            closeAllHAConnections();
            console.log('[StreamingOrchestrator] Closed all HA WebSocket connections');
        } catch (error) {
            console.warn('[StreamingOrchestrator] Error closing HA connections:', error);
        }

        // Note: Other cleanup logic (LLM callers, record keepers, etc.) should be handled by their respective owners
    }
}
