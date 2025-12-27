import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  server: {
    port: 3001,
    host: "0.0.0.0",
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
      "@shared": resolve(__dirname, "../../lib/shared"),
    },
  },
  build: {
    target: "node20",
    ssr: true,
    outDir: "dist",
    rollupOptions: {
      input: {
        server: resolve(__dirname, "server.ts"),
      },
      output: {
        format: "es",
      },
      external: (id) => {
        // Externalize Node.js built-ins
        if (id.startsWith("node:")) return true;
        // Externalize all npm packages
        if (!id.startsWith(".") && !id.startsWith("/") && !id.startsWith(resolve(__dirname))) {
          return true;
        }
        return false;
      },
    },
  },
});
