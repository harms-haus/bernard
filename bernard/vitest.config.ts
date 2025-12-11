import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const rootDir = fileURLToPath(new URL("./", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": rootDir
    }
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globals: false,
    coverage: {
      provider: "v8",
      include: ["{app,lib}/**/*.{ts,tsx}"],
      exclude: ["**/index.ts", "tests/**", ".next/**", "node_modules/**"]
    }
  }
});
