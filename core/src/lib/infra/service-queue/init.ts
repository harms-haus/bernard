import { logger } from '@/lib/logging/logger';
import { startServiceWorker } from './worker';

let initialized = false;

export async function initializeServiceQueue(): Promise<void> {
  if (initialized) {
    return;
  }

  try {
    await startServiceWorker();
    logger.info('[ServiceQueue] Service queue worker initialized');
    initialized = true;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    logger.error(
      { error: errorMessage },
      '[ServiceQueue] Failed to initialize service queue worker'
    );
  }
}

export function isServiceQueueInitialized(): boolean {
  return initialized;
}
