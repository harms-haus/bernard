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
        let timeout = false;

        // Set a timeout for each stream mode test
        const timeoutHandle = setTimeout(() => {
          timeout = true;
          logger.warn({ mode }, 'Timeout after 5 seconds');
        }, 5000);

        for await (const chunk of runStream) {
          clearTimeout(timeoutHandle);
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

        clearTimeout(timeoutHandle);

        if (timeout) {
          logger.warn({ mode }, 'No events received within 5 seconds');
        } else {
          logger.info({ mode, eventCount }, 'Stream completed');
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
      for await (const chunk of multiStream) {
        eventCount++;

        if (eventCount > 5) {
          logger.debug({ eventCount }, 'Breaking after 5 events');
          break;
        }
      }
      logger.info({ eventCount }, 'Multi-mode stream completed');
    } catch (error) {
      logger.error({ error: (error as Error).message }, 'Multi-mode stream error');
    }

  } catch (error) {
    logger.error({ error }, 'Setup error');
  }
}

testAllStreamModes();
