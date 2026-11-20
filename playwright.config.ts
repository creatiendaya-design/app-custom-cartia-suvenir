import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: ["e2e.spec.ts", "theme-button.spec.ts"],
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:3001",
    headless: true,
    channel: "chrome",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run build && npm run preview:local -- --port 3001",
        url: "http://127.0.0.1:3001/health",
        reuseExistingServer: false,
        env: { LOCAL_DEMO: "true", DATABASE_PATH: "./tmp/e2e.sqlite" },
        timeout: 60000,
      },
});
