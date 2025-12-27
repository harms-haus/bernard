import pino from "pino";

const service = process.env["SERVICE_NAME"] ?? "bernard-unified-server";
const env = process.env["NODE_ENV"] ?? "development";
const version = process.env["VERCEL_GIT_COMMIT_SHA"] ?? process.env["npm_package_version"];

export const logger = pino({
  level: process.env["LOG_LEVEL"] ?? "info",
  base: { service, env, ...(version ? { version } : {}) },
  redact: {
    paths: [
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
    ],
    censor: "[redacted]"
  },
  formatters: {
    level(label) {
      return { level: label };
    }
  },
  timestamp: pino.stdTimeFunctions.isoTime
});
