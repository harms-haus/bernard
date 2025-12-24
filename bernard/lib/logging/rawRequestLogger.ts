import { promises as fs } from "node:fs";
import path from "node:path";

const LOG_DIR = process.env["RAW_REQUEST_LOG_DIR"] ?? path.join(process.cwd(), "logs", "raw-requests");

/**
 * Ensure the log directory exists
 */
async function ensureLogDir(): Promise<void> {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
  } catch (err) {
    // Directory might already exist, ignore error
    if ((err as { code?: string }).code !== "EEXIST") {
      console.error("Failed to create raw request log directory:", err);
    }
  }
}

/**
 * Log raw incoming request to a file with timestamp
 */
export async function logRawRequest(
  requestBody: unknown,
  metadata?: {
    conversationId?: string;
    requestId?: string;
    timestamp?: string;
  }
): Promise<void> {
  try {
    await ensureLogDir();
    
    const timestamp = metadata?.timestamp ?? new Date().toISOString();
    const filename = `request-${timestamp.replace(/[:.]/g, "-")}.json`;
    const filepath = path.join(LOG_DIR, filename);

    const logEntry = {
      timestamp,
      ...metadata,
      body: requestBody
    };

    await fs.writeFile(filepath, JSON.stringify(logEntry, null, 2), "utf-8");
  } catch (err) {
    // Don't fail the request if logging fails
    console.error("Failed to log raw request:", err);
  }
}

