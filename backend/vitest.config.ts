import { defineConfig } from "vitest/config";

export default defineConfig({
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
