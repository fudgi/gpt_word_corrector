import { defineConfig } from "@playwright/test";
import path from "path";

const testDir = path.join(__dirname);

export default defineConfig({
  testDir,
  timeout: 120000,
  expect: {
    timeout: 15000,
  },
  projects: [
    {
      name: "chromium-with-extension",
      use: {
        headless: false,
      },
    },
  ],
});
