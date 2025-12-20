import { test as base, chromium } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Custom test fixture that loads the Chrome extension
export const test = base.extend({
  // Override context to use persistent context with extension
  context: async ({}, use) => {
    const pathToExtension = path.join(__dirname, "../../corrector");

    const context = await chromium.launchPersistentContext("", {
      headless: false, // Extensions require headed mode
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    });
    await use(context);
    await context.close();
  },

  // Get the extension ID from service worker
  extensionId: async ({ context }, use) => {
    // For manifest v3: wait for service worker
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent("serviceworker");
    }
    const extensionId = serviceWorker.url().split("/")[2];
    await use(extensionId);
  },
});

export const expect = test.expect;
