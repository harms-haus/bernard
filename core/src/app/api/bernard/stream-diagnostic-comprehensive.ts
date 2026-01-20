/**
 * Comprehensive diagnostic test for LangGraph stream formats
 */

import { Client } from '@langchain/langgraph-sdk';
import { logger } from '@/lib/logging/logger';

const LANGGRAPH_API_URL = process.env.BERNARD_AGENT_URL || 'http://127.0.0.1:2024';

const client = new Client({
  apiUrl: LANGGRAPH_API_URL,
});

async function testAllStreamModes() {
  try {
    // Create a thread first
    const thread = await client.threads.create();
    logger.info({ threadId: thread.thread_id }, 'Created thread');

    const messages = [{ role: 'user', content: 'Hello' }];

    // Test different stream modes
    const streamModes = ['updates', 'values', 'messages', 'events', 'debug'] as const;

    for (const mode of streamModes) {
      logger.info({ mode }, 'Testing streamMode');

      try {
        const runStream = client.runs.stream(
          thread.thread_id,
          'bernard_agent',
          {
            input: { messages },
            streamMode: [mode] as const,
          }
        );

        let eventCount = 0;
        let firstChunk: unknown = null;

        // Use AbortController for proper timeout handling
        const controller = new AbortController();
        let timeoutHandle: NodeJS.Timeout | null = null;

        const resetTimeout = () => {
          if (timeoutHandle) {
            clearTimeout(timeoutHandle);
          }
          timeoutHandle = setTimeout(() => {
            controller.abort();
            logger.warn({ mode, eventCount }, 'Timeout after 5 seconds');
          }, 5000);
        };

        resetTimeout();

        try {
          for await (const chunk of runStream) {
            if (controller.signal.aborted) {
              break;
            }
            resetTimeout();
            eventCount++;
            if (!firstChunk) {
              firstChunk = chunk;
              logger.debug({ mode, chunkType: typeof chunk }, 'First chunk received');
            }

            // If we get too many events, break
            if (eventCount > 5) {
              logger.debug({ mode, eventCount }, 'Breaking after 5 events');
              break;
            }
          }

          if (timeoutHandle) {
            clearTimeout(timeoutHandle);
          }

          if (controller.signal.aborted) {
            logger.warn({ mode, eventCount }, 'Stream aborted due to timeout');
          } else {
            logger.info({ mode, eventCount }, 'Stream completed');
          }
        } catch (error) {
          if (timeoutHandle) {
            clearTimeout(timeoutHandle);
          }
          if (controller.signal.aborted) {
            logger.warn({ mode, eventCount }, 'Stream aborted due to timeout');
          } else {
            throw error;
          }
        }

      } catch (error) {
        logger.error({ mode, error: (error as Error).message }, 'Stream error');
      }
    }

    // Test multiple stream modes at once
    logger.info('Testing streamMode: ["updates", "messages"]');
    try {
      const multiStream = client.runs.stream(
        thread.thread_id,
        'bernard_agent',
        {
          input: { messages: [{ role: 'user', content: 'Test 2' }] },
          streamMode: ['updates', 'messages'] as const,
        }
      );

      let eventCount = 0;
      let timeoutHandle: NodeJS.Timeout | null = null;
      const controller = new AbortController();

      const resetTimeout = () => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        timeoutHandle = setTimeout(() => {
          controller.abort();
          logger.warn({ eventCount }, 'Multi-mode stream timeout after 5 seconds');
        }, 5000);
      };

      resetTimeout();

      try {
        for await (const chunk of multiStream) {
          if (controller.signal.aborted) {
            break;
          }
          resetTimeout();
          eventCount++;

          if (eventCount > 5) {
            logger.debug({ eventCount }, 'Breaking after 5 events');
            break;
          }
        }

        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        if (controller.signal.aborted) {
          logger.warn({ eventCount }, 'Multi-mode stream aborted due to timeout');
        } else {
          logger.info({ eventCount }, 'Multi-mode stream completed');
        }
      } catch (error) {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        if (controller.signal.aborted) {
          logger.warn({ eventCount }, 'Multi-mode stream aborted due to timeout');
        } else {
          throw error;
        }
      }
    } catch (error) {
      logger.error({ error: (error as Error).message }, 'Multi-mode stream error');
    }

  } catch (error) {
    logger.error({ error }, 'Setup error');
  }
}

testAllStreamModes();
