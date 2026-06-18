import { defineConfig } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  /* Global timeout: 2min per test (avoids per-test setTimeouts). */
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  ...(process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? {}
    : {
        webServer: {
          command: "npm run dev",
          env: {
            ...process.env,
            AGENT_DISABLE_LLM: "1",
          },
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
          url: baseURL,
        },
      }),
});
