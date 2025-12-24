import { loadEnvConfig } from "@next/env";

// Load Next-style env files before the worker imports anything that reads process.env.
// Load Next-style env files before the worker imports anything that reads process.env.
loadEnvConfig(process.cwd());

(async () => {
  await import("./taskWorkerMain");
})().catch((err) => {
  // Surface startup failures clearly and exit non-zero for supervision.
  console.error("Failed to start task worker", err);
  process.exit(1);
});
