import crypto from "node:crypto";
import pino, { stdTimeFunctions, type Logger, type LoggerOptions, type TransportSingleOptions } from "pino";

export type LogContext = {
  requestId?: string;
  conversationId?: string;
  queueItemId?: string;
  userId?: string;
  adminId?: string;
  actor?: string;
  turnId?: string;
  jobId?: string;
  route?: string;
  stage?: string;
  component?: string;
};

export const redactionPaths = [
  "apiKey",
  "apikey",
  "authorization",
  "auth",
  "secret",
  "clientSecret",
  "password",
  "token",
  "refreshToken",
  "accessToken",
  "*.apiKey",
  "*.token",
  "*.authorization"
];

function parseJsonOption(raw: string | undefined): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function buildTransport(): TransportSingleOptions | undefined {
  const forcePretty = process.env["LOG_PRETTY"] === "true";
  const isDev = process.env["NODE_ENV"] !== "production";
  const customTarget = process.env["LOG_TRANSPORT_TARGET"];
  const customOptions = parseJsonOption(process.env["LOG_TRANSPORT_OPTIONS"]);

  if (forcePretty || isDev) {
    return {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        singleLine: true,
        ignore: "pid,hostname"
      }
    };
  }

  if (customTarget) {
    return { target: customTarget, options: customOptions };
  }

  return undefined;
}

const service = process.env["SERVICE_NAME"] ?? "bernard";
const env = process.env["NODE_ENV"] ?? "development";
const version = process.env["VERCEL_GIT_COMMIT_SHA"] ?? process.env["npm_package_version"];

const options: LoggerOptions = {
  level: process.env["LOG_LEVEL"] ?? "info",
  base: { service, env, ...(version ? { version } : {}) },
  redact: { paths: redactionPaths, censor: "[redacted]" },
  formatters: {
    level(label) {
      return { level: label };
    }
  },
  timestamp: stdTimeFunctions.isoTime,
  transport: buildTransport()
};

export const logger = pino(options);

function pruneUndefined(context: LogContext): Record<string, string> {
  const entries = Object.entries(context).filter(([, value]) => value !== undefined && value !== null);
  return Object.fromEntries(entries.map(([key, value]) => [key, String(value)]));
}

export function childLogger(context: LogContext = {}, base: Logger = logger): Logger {
  const bindings = pruneUndefined(context);
  if (!Object.keys(bindings).length) return base;
  return base.child(bindings);
}

export function ensureRequestId(existing?: string | null): string {
  return existing && existing.length > 0 ? existing : crypto.randomUUID();
}

export function startTimer() {
  const start = Date.now();
  return () => Date.now() - start;
}

export function toErrorObject(err: unknown): { message: string; stack?: string; name?: string } {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack, name: err.name };
  }
  if (typeof err === "string") return { message: err };
  return { message: JSON.stringify(err) };
}
