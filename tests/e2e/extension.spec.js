import { test, expect } from "./fixtures";
import http from "node:http";

let pageServer;
let baseUrl;

test.beforeAll(async () => {
  // Page server (textarea host) - specific to this test
  pageServer = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(
      `<textarea id="editor" style="width:600px;height:120px;"></textarea>`
    );
  });

  await new Promise((resolve) => pageServer.listen(0, "127.0.0.1", resolve));
  const { port } = pageServer.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

test.afterAll(async () => {
  await new Promise((resolve) => pageServer.close(resolve));
});

test("DOM hotkey (Ctrl+Shift+1) polishes selected text in textarea", async ({
  page,
}) => {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

  const editor = page.locator("#editor");
  await editor.click();
  await editor.fill("helo world");

  // select entire value (length 10)
  await page.evaluate(() => {
    const el = document.querySelector("#editor");
    el.focus();
    el.setSelectionRange(0, 10);
  });

  // Trigger DOM-level hotkey for polish mode
  await page.keyboard.press("Control+Shift+1");

  // Now the stub returns "Hello, world!"
  await expect(editor).toHaveValue("Hello, world!", { timeout: 10000 });

  // Optional: notification appears
  const notification = page.locator("#corrector-notification");
  await expect(notification).toBeVisible({ timeout: 5000 });
});

test("DOM hotkey (Ctrl+Shift+2) translates selected text to English in textarea", async ({
  page,
}) => {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

  const editor = page.locator("#editor");
  await editor.click();
  await editor.fill("Bonjour le monde");

  // select entire value (length 17)
  await page.evaluate(() => {
    const el = document.querySelector("#editor");
    el.focus();
    el.setSelectionRange(0, 17);
  });

  // Trigger DOM-level hotkey for to_en mode
  await page.keyboard.press("Control+Shift+2");

  // Now the stub returns "Hello world"
  await expect(editor).toHaveValue("Hello world", { timeout: 10000 });

  // Optional: notification appears
  const notification = page.locator("#corrector-notification");
  await expect(notification).toBeVisible({ timeout: 5000 });
});
