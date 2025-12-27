import type { NextRequest } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { readFile } from "fs/promises";
import { join } from "path";

import { requireAdmin } from "@/lib/auth";
import { RecordKeeper } from "@/agent/recordKeeper/conversation.keeper";
import type { RecordKeeperStatus } from "@/lib/conversation/types";
import { getRedis } from "@/lib/infra/redis";
import packageJson from "@/package.json";

export const runtime = "nodejs";

const execAsync = promisify(exec);

type HealthStatus = "online" | "degraded" | "offline";

interface ServiceInfo {
  name: string;
  port: number;
  endpoint?: string;
  logFile?: string;
  description: string;
}

interface ServiceStatus {
  name: string;
  port: number;
  description: string;
  status: HealthStatus;
  error: string | undefined;
  logs: string[] | undefined;
}

interface StatusResponse {
  status: HealthStatus;
  uptimeSeconds: number;
  startedAt: string;
  version: string | undefined;
  lastActivityAt: string | undefined;
  activeConversations: number;
  tokensActive: number;
  queueSize: number;
  notes: string | undefined;
  recordKeeper: RecordKeeperStatus;
  services?: ServiceStatus[];
}

const SERVICES: ServiceInfo[] = [
  { name: "Redis", port: 6379, description: "Database and caching service" },
  { name: "vLLM", port: 8001, endpoint: "/health", logFile: "api/logs/vllm-embedding.log", description: "AI embedding service" },
  { name: "Kokoro", port: 8880, endpoint: "/health", logFile: "api/logs/kokoro.log", description: "Text-to-speech service" },
  { name: "Whisper", port: 8002, endpoint: "/health", logFile: "api/logs/whisper.log", description: "Speech-to-text service" },
  { name: "Bernard", port: 3001, endpoint: "/health", logFile: "logs/bernard.log", description: "Main application server" },
  { name: "Bernard-UI", port: 4200, endpoint: "/", logFile: "logs/bernard-ui.log", description: "Frontend interface" },
  { name: "Server", port: 3456, endpoint: "/health", logFile: "api/logs/proxy.log", description: "Unified API server" },
];

// Check service health
async function checkServiceHealth(service: ServiceInfo): Promise<{ status: HealthStatus; error?: string }> {
  try {
    if (service.endpoint) {
      // HTTP endpoint check
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`http://localhost:${service.port}${service.endpoint}`, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Bernard-Status-Check/1.0' }
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return { status: "online" };
      } else {
        return { status: "offline", error: `HTTP ${response.status}` };
      }
    } else {
      // Simple port check for Redis
      const { stdout } = await execAsync(`timeout 2 bash -c "echo > /dev/tcp/localhost/${service.port}" 2>/dev/null && echo "ok" || echo "failed"`);
      if (stdout.trim() === "ok") {
        return { status: "online" };
      } else {
        return { status: "offline", error: "Port not accessible" };
      }
    }
  } catch (error) {
    return {
      status: "offline",
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

// Get service logs
async function getServiceLogs(service: ServiceInfo, lines: number = 50): Promise<string[]> {
  if (!service.logFile) {
    return [];
  }

  try {
    const logPath = join(process.cwd(), "..", "..", service.logFile);
    const content = await readFile(logPath, "utf-8");
    const linesArray = content.split("\n").filter(line => line.trim());
    return linesArray.slice(-lines);
  } catch (error) {
    return [`Error reading logs: ${error instanceof Error ? error.message : "Unknown error"}`];
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const includeServices = url.searchParams.get("services") === "true";
  const includeLogs = url.searchParams.get("logs") === "true";

  // Check if admin is required for detailed status
  const isAdmin = await requireAdmin(req);
  if (includeServices && !isAdmin) {
    return new Response(JSON.stringify({ error: "Unauthorized for detailed status" }), { status: 401 });
  }

  try {
    const keeper = new RecordKeeper(getRedis());
    await keeper.closeIfIdle();
    const recordKeeper = await keeper.getStatus();

    const uptimeSeconds = Math.floor(process.uptime());
    const startedAt = new Date(Date.now() - uptimeSeconds * 1000).toISOString();
    const version = typeof (packageJson as { version?: unknown }).version === "string" ? packageJson.version : undefined;
    const status: HealthStatus = "online";
    const lastActivityAt = recordKeeper.lastActivityAt;

    const response: StatusResponse = {
      status,
      uptimeSeconds,
      startedAt,
      version,
      lastActivityAt,
      activeConversations: recordKeeper.activeConversations,
      tokensActive: recordKeeper.tokensActive,
      queueSize: 0,
      notes: recordKeeper.summarizerEnabled ? "Summaries enabled" : "Summaries disabled",
      recordKeeper
    };

    // Add service status if requested and user is admin
    if (includeServices && isAdmin) {
      const services = await Promise.all(
        SERVICES.map(async (service) => {
          const health = await checkServiceHealth(service);
          const logs = includeLogs ? await getServiceLogs(service) : undefined;

          return {
            name: service.name,
            port: service.port,
            description: service.description,
            status: health.status,
            error: health.error,
            logs
          };
        })
      );

      response.services = services;
    }

    return Response.json(response);
  } catch (err) {
    console.error("Failed to read Bernard status", err);
    return new Response(JSON.stringify({ error: "Unable to read status" }), { status: 500 });
  }
}


