import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Resolve the workspace package from its TypeScript source so Vitest never
    // depends on `shared/dist` being built. The compiled output (package
    // `main`) is only needed by the backend's compiled Node runtime.
    alias: {
      "@flaque/shared": fileURLToPath(new URL("../shared/src/index.ts", import.meta.url))
    }
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Each integration test boots a full HTTP server, seeds SQLite, and runs
    // many round-trips. Under vitest's parallel file execution the default 5s
    // is too tight for the longest flows (auth reset, playlist CRUD, radio).
    testTimeout: 30_000,
    hookTimeout: 30_000
  }
});
