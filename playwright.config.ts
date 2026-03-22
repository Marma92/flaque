import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

const backendPort = 4100;
const frontendPort = 4173;
const e2eDataRoot = path.resolve(__dirname, ".e2e/data");

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: {
    timeout: 10_000
  },
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${frontendPort}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  webServer: [
    {
      command: `bash -lc 'rm -rf "${e2eDataRoot}" && mkdir -p "${e2eDataRoot}" && npm run start --workspace backend'`,
      url: `http://127.0.0.1:${backendPort}/health`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        ...process.env,
        PORT: String(backendPort),
        DATA_ROOT: e2eDataRoot,
        ADMIN_USERNAME: "admin",
        ADMIN_EMAIL: "admin@example.com",
        ADMIN_PASSWORD: "admin-secret-123",
        CORS_ORIGIN: `http://127.0.0.1:${frontendPort}`,
        NODE_ENV: "test",
        PASSWORD_RESET_BASE_URL: `http://127.0.0.1:${frontendPort}`,
        SESSION_COOKIE_SECURE: "false"
      }
    },
    {
      command: `npm run dev --workspace frontend -- --host 127.0.0.1 --port ${frontendPort}`,
      url: `http://127.0.0.1:${frontendPort}`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        ...process.env,
        VITE_PROXY_TARGET: `http://127.0.0.1:${backendPort}`
      }
    }
  ],
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"]
      }
    }
  ]
});
