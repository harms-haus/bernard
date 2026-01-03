import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve, dirname, join } from "node:path";
import tsconfigPaths from "vite-tsconfig-paths";

import { defineConfig } from "vitest/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = __dirname;

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: [join(rootDir, "tests/**/*.test.ts"), join(rootDir, "src/**/*.test.ts")],
    environment: "node",
    globals: false,
    coverage: {
      provider: "v8",
      include: ["{app,lib}/**/*.{ts,tsx}"],
      exclude: ["**/index.ts", "tests/**", ".next/**", "node_modules/**"]
    }
  }
});
