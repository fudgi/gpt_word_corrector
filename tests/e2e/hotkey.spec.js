import { test, expect } from "../setup/fixtures";
import { enableE2E } from "./helpers/enableE2E.js";
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
  await enableE2E(page);

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
  await enableE2E(page);

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

test("Undo (Ctrl+Z) restores original text after correction", async ({
  page,
}) => {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await enableE2E(page);

  const editor = page.locator("#editor");
  await editor.click();

  const originalText = "helo world";

  // Type text manually (important for undo stack)
  await editor.pressSequentially(originalText);

  // select entire value
  await page.evaluate(() => {
    const el = document.querySelector("#editor");
    el.focus();
    el.setSelectionRange(0, el.value.length);
  });

  // Trigger correction
  await page.keyboard.press("Control+Shift+1");

  // Wait for correction to apply
  await expect(editor).toHaveValue("Hello, world!", { timeout: 10000 });

  // Press Ctrl+Z to undo
  await editor.focus();
  await page.keyboard.press("Control+z");

  // Original text should be restored
  await expect(editor).toHaveValue(originalText, { timeout: 5000 });
});

test("Only selected word is transformed, rest of text remains unchanged", async ({
  page,
}) => {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await enableE2E(page);

  const editor = page.locator("#editor");
  await editor.click();
  await editor.fill("helo world test");

  // Select only the first word "helo" (positions 0-4)
  await page.evaluate(() => {
    const el = document.querySelector("#editor");
    el.focus();
    el.setSelectionRange(0, 4); // Select "helo"
  });

  // Trigger DOM-level hotkey for polish mode
  await page.keyboard.press("Control+Shift+1");

  // Only the selected word should be transformed, rest should remain unchanged
  await expect(editor).toHaveValue("Hello world test", { timeout: 10000 });

  // Optional: notification appears
  const notification = page.locator("#corrector-notification");
  await expect(notification).toBeVisible({ timeout: 5000 });
});

test("Only latest (BBB) applies; older (AAA) is ignored even if it finishes later", async ({
  page,
}) => {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await enableE2E(page);

  const editor = page.locator("#editor");
  await editor.click();
  await editor.fill("AAA BBB");

  // Select AAA and trigger
  await page.evaluate(() => {
    const el = document.querySelector("#editor");
    el.focus();
    el.setSelectionRange(0, 3);
  });
  await page.keyboard.press("Control+Shift+1");

  // Wait just enough to ensure AAA debounce passed and request is in-flight.
  // Instead of a fixed sleep, wait for any observable UI signal if you have one.
  // If you don't have one, keep a small buffer but don't rely on it for correctness.
  await page.waitForTimeout(220);

  // Select BBB and trigger
  await page.evaluate(() => {
    const el = document.querySelector("#editor");
    el.focus();
    el.setSelectionRange(4, 7);
  });
  await page.keyboard.press("Control+Shift+1");

  // 1) Wait until BBB applied (this should happen first)
  await expect(editor).toHaveValue("AAA BBB_CORRECTED", { timeout: 5000 });

  // 2) Now wait longer than AAA remaining worst-case and assert it did NOT overwrite
  // Debounce(200) + AAA delay(300) + buffers = ~600-800ms
  await page.waitForTimeout(800);

  await expect(editor).toHaveValue("AAA BBB_CORRECTED");
});
