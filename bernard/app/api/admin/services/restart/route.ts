import type { NextRequest } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";

const execAsync = promisify(exec);

const SERVICE_SCRIPTS: Record<string, string> = {
  redis: "scripts/services/redis.sh",
  vllm: "scripts/services/vllm-embedding.sh",
  kokoro: "scripts/services/kokoro.sh",
  whisper: "scripts/services/whisper.sh",
  bernard: "scripts/services/bernard.sh",
  "bernard-ui": "scripts/services/bernard-ui.sh",
  server: "scripts/services/server.sh"
};

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  try {
    const body = await req.json() as { service?: unknown };
    const service = body.service;

    if (!service || typeof service !== "string") {
      return new Response(JSON.stringify({ error: "Service name is required" }), { status: 400 });
    }

    const scriptPath = SERVICE_SCRIPTS[service];
    if (!scriptPath) {
      return new Response(JSON.stringify({
        error: "Invalid service name",
        availableServices: Object.keys(SERVICE_SCRIPTS)
      }), { status: 400 });
    }

    const fullPath = `${process.cwd()}/../${scriptPath}`;

    // Execute the restart command
    const { stdout, stderr } = await execAsync(`${fullPath} restart`);

    return Response.json({
      success: true,
      service,
      message: `Restart initiated for ${service}`,
      output: stdout || stderr
    });

  } catch (error) {
    console.error("Failed to restart service:", error);
    return new Response(JSON.stringify({
      error: "Failed to restart service",
      details: error instanceof Error ? error.message : "Unknown error"
    }), { status: 500 });
  }
}
