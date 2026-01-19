/**
 * Diagnostic test to understand LangGraph SDK stream format
 */

import { Client } from '@langchain/langgraph-sdk';
import { logger } from '@/lib/logging/logger';

const LANGGRAPH_API_URL = process.env.BERNARD_AGENT_URL || 'http://127.0.0.1:2024';

const client = new Client({
  apiUrl: LANGGRAPH_API_URL,
});

async function testStreamFormat() {
  try {
    // Create a thread first
    const thread = await client.threads.create();
    logger.info({ threadId: thread.thread_id }, 'Created thread');

    const messages = [{ role: 'user', content: 'Hello, test message' }];

    // Test with messages stream mode
    logger.info('Testing streamMode: ["messages"]');
    const runStream = client.runs.stream(
      thread.thread_id,
      'bernard_agent',
      {
        input: { messages },
        streamMode: ['messages'] as const,
      }
    );

    let eventCount = 0;
    let firstChunk: unknown = null;
    let lastChunk: unknown = null;

    for await (const chunk of runStream) {
      eventCount++;
      if (!firstChunk) firstChunk = chunk;
      lastChunk = chunk;

      logger.debug({ eventCount }, 'Event received');

      // If we get too many events, break to avoid infinite loop
      if (eventCount > 10) {
        logger.debug({ eventCount }, 'Breaking after 10 events');
        break;
      }
    }

    logger.info({ eventCount, hasFirstChunk: !!firstChunk }, 'Messages stream completed');

    // Test with updates stream mode for comparison
    logger.info('Testing streamMode: ["updates"]');
    const updatesStream = client.runs.stream(
      thread.thread_id,
      'bernard_agent',
      {
        input: { messages: [{ role: 'user', content: 'Second test' }] },
        streamMode: ['updates'] as const,
      }
    );

    eventCount = 0;
      for await (const chunk of updatesStream) {
        eventCount++;
        logger.debug({ eventCount }, 'Update event received');
        if (eventCount > 5) break;
      }
      logger.info({ eventCount }, 'Updates stream completed');

  } catch (error) {
    logger.error({ error }, 'Stream test error');
  }
}

testStreamFormat();
