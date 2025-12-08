import {
  chromium,
  expect as baseExpect,
  test as base,
  BrowserContext,
  Page,
} from "@playwright/test";
import path from "path";

const extensionPath = path.join(process.cwd(), "corrector");

export const test = base.extend<{ context: BrowserContext; page: Page }>({
  context: async ({}, use) => {
    const userDataDir = path.join(process.cwd(), "tmp-playwright-profile");
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });

    await use(context);

    await context.close();
  },
  page: async ({ context }, use) => {
    const pages = context.pages();
    const page = pages.length ? pages[0] : await context.newPage();
    await use(page);
  },
});

export const expect = baseExpect;
