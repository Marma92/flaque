import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Resolve the workspace package from its TypeScript source so Vite and
    // Vitest never depend on `shared/dist` being built. The compiled output
    // (package `main`) is only needed by the backend's Node runtime.
    alias: {
      "@flaque/shared": fileURLToPath(new URL("../shared/src/index.ts", import.meta.url))
    }
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_PROXY_TARGET ?? "http://localhost:4000",
        changeOrigin: true
      }
    }
  },
  test: {
    setupFiles: ["./src/test/setup.ts"]
  }
});
