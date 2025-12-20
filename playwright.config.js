import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { open: "never" }], ["list"]],
  outputDir: "test-results",

  use: {
    // Base URL for API tests - server must be running (npm run server)
    baseURL: "http://localhost:8787",
    trace: "on-first-retry",
  },
});
