import { promises as fs } from 'node:fs';
import { join } from 'node:path';

// ANSI escape code regex pattern
const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

function stripAnsiCodes(input: string): string {
  return input.replace(ANSI_PATTERN, '');
}

function getLogDir(): string {
  return process.env.LOG_DIR || join(process.cwd(), 'logs');
}

const SENSITIVE_FIELDS = [
  'apiKey', 'token', 'password', 'secret', 'authorization',
  'access_token', 'refresh_token', 'client_secret', 'privateKey',
  'private_key', 'credential', 'passphrase'
];

export interface ParsedLogEntry {
  timestamp: string;
  level: string;
  service: string;
  message: string;
  raw: string;
  [key: string]: unknown;
}

interface CleanupFunction {
  destroy: () => void;
}

export class LogStreamer {
  private activeStreams: Map<string, CleanupFunction> = new Map();

  parseLogLine(line: string): ParsedLogEntry {
    // Strip ANSI escape codes first (e.g., [32m for green color)
    const raw = stripAnsiCodes(line).trim();
    if (!raw) {
      throw new Error('Empty line');
    }

    try {
      const parsed = JSON.parse(raw);
      return {
        timestamp: parsed.time || parsed.timestamp || new Date().toISOString(),
        level: parsed.level || 'info',
        service: parsed.service || 'unknown',
        message: parsed.msg || parsed.message || raw,
        raw,
        ...parsed,
      };
    } catch {
      const timestampMatch = raw.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)/);
      const timestamp = timestampMatch ? timestampMatch[1] : new Date().toISOString();

      let level = 'info';
      const levelMatch = raw.match(/\[(\d+;)?(\d+)m(INFO|WARN|ERROR|DEBUG)/i) ||
                        raw.match(/\b(INFO|WARN|ERROR|DEBUG)\b/i);
      if (levelMatch) {
        const match = levelMatch[0] as string;
        level = match.toLowerCase();
      }

      let service = 'unknown';
      const serviceMatch = raw.match(/\[(PROXY-API|BERNARD|BERNARD-AGENT|BERNARD-API|BERNARD-UI|VLLM|WHISPER|KOKORO|REDIS)\]/i);
      if (serviceMatch) {
        service = serviceMatch[1].toLowerCase().replace('-', '-');
      }

      return {
        timestamp,
        level,
        service,
        message: raw,
        raw,
      };
    }
  }

  redactSensitiveFields(entry: ParsedLogEntry): ParsedLogEntry {
    const redacted = { ...entry };
    for (const key of Object.keys(redacted)) {
      if (SENSITIVE_FIELDS.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
        (redacted as Record<string, unknown>)[key] = '[REDACTED]';
      }
    }
    return redacted;
  }

  getLogPath(service: string): string {
    const serviceName = service.toLowerCase().replace(/_/g, '-');
    return `${getLogDir()}/${serviceName}.log`;
  }

  async logExists(service: string): Promise<boolean> {
    try {
      const path = this.getLogPath(service);
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  async tailLog(service: string, lines: number = 100): Promise<ParsedLogEntry[]> {
    const path = this.getLogPath(service);
    try {
      const content = await fs.readFile(path, 'utf-8');
      const allLines = content.split('\n').filter(line => line.trim());
      const recentLines = allLines.slice(-lines);
      return recentLines.map(line => {
        const entry = this.parseLogLine(line);
        return this.redactSensitiveFields(entry);
      });
    } catch {
      return [];
    }
  }

  async watchLog(
    service: string,
    onLine: (entry: ParsedLogEntry) => void,
    onError?: (error: Error) => void
  ): Promise<void> {
    const path = this.getLogPath(service);

    try {
      let position = 0;
      const fileHandle = await fs.open(path, 'r');
      const initialSize = (await fileHandle.stat()).size;
      position = initialSize;

      const readChunk = async () => {
        try {
          const stats = await fileHandle.stat();
          if (stats.size < position) {
            position = 0;
          }

          if (stats.size > position) {
            const bytesToRead = stats.size - position;
            const buffer = Buffer.alloc(bytesToRead);
            const readResult = await fileHandle.read(buffer, 0, bytesToRead, position);
            const bytesRead = readResult.bytesRead;
            position += bytesRead;

            const text = buffer.toString('utf-8', 0, bytesRead);
            const lines = text.split('\n');

            for (const line of lines.slice(0, -1)) {
              if (line.trim()) {
                try {
                  const entry = this.parseLogLine(line);
                  onLine(this.redactSensitiveFields(entry));
                } catch {
                  // Skip unparseable lines
                }
              }
            }

            const lastLine = lines[lines.length - 1];
            if (lastLine && lastLine.trim()) {
              const lastLineBytes = Buffer.from(lastLine, 'utf-8').length;
              position -= lastLineBytes + 1;
            }
          }
        } catch (error) {
          if (onError) {
            onError(error as Error);
          }
        }
      };

      const interval = setInterval(readChunk, 100);

      this.activeStreams.set(service, {
        destroy: () => {
          clearInterval(interval);
          fileHandle.close();
        }
      });

    } catch (error) {
      if (onError) {
        onError(error as Error);
      }
    }
  }

  async unwatchLog(service: string): Promise<void> {
    const cleanup = this.activeStreams.get(service);
    if (cleanup) {
      cleanup.destroy();
      this.activeStreams.delete(service);
    }
  }

  async stopAll(): Promise<void> {
    for (const service of this.activeStreams.keys()) {
      await this.unwatchLog(service);
    }
  }
}

let logStreamer: LogStreamer | null = null;

export function getLogStreamer(): LogStreamer {
  if (!logStreamer) {
    logStreamer = new LogStreamer();
  }
  return logStreamer;
}
