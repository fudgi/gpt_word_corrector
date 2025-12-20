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

test("context menu trigger opens popup with selected text", async ({
  page,
}) => {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

  await page.evaluate(() => {
    document.documentElement.setAttribute("data-pw-e2e", "1");
  });

  page.on("console", (msg) => console.log("PAGE:", msg.type(), msg.text()));
  await page.waitForSelector('html[data-corrector-bound="1"]', {
    timeout: 10000,
  });

  const editor = page.locator("#editor");
  await editor.click();
  await editor.fill("helo world");

  // select entire value
  await page.evaluate(() => {
    const el = document.querySelector("#editor");
    el.focus();
    el.setSelectionRange(0, el.value.length);
  });

  // right click to trigger context menu handler
  await editor.click({ button: "right" });

  await page.waitForSelector('html[data-corrector-bound="1"]', {
    timeout: 10000,
  });

  const resp = await page.evaluate(() => {
    const el = document.querySelector("#editor");
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const selectionText = el.value.slice(start, end);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        window.removeEventListener("message", onMsg);
        reject(new Error("No response from e2e bridge"));
      }, 3000);

      function onMsg(e) {
        if (e.data?.type !== "__E2E_CONTEXT_MENU_CLICK_RESULT__") return;
        clearTimeout(timer);
        window.removeEventListener("message", onMsg);
        resolve(e.data.resp);
      }

      window.addEventListener("message", onMsg);
      window.postMessage(
        { type: "__E2E_CONTEXT_MENU_CLICK__", selectionText },
        "*"
      );
    });
  });

  expect(resp?.ok).toBe(true);

  const popup = page.locator("#corrector-popup");
  await expect(popup).toBeVisible({ timeout: 5000 });

  // click Polish
  await page.evaluate(() => {
    const popupEl = document.getElementById("corrector-popup");
    const btn = popupEl?.shadowRoot?.querySelector(
      'button[data-mode="polish"]'
    );
    if (!btn) throw new Error("No polish button");
    btn.click();
  });

  // wait apply enabled
  await page.waitForFunction(
    () => {
      const popupEl = document.getElementById("corrector-popup");
      const applyButton = popupEl?.shadowRoot?.querySelector(
        'button[data-action="apply"]'
      );
      return !!applyButton && !applyButton.disabled;
    },
    { timeout: 10000 }
  );

  // verify stub result appears in popup
  await page.waitForFunction(
    () => {
      const popupEl = document.getElementById("corrector-popup");
      const root = popupEl?.shadowRoot;
      const text = root?.textContent || popupEl?.textContent || "";
      return text.includes("Hello, world!");
    },
    { timeout: 10000 }
  );

  const notificationHost = page.locator("#corrector-notification.success");
  const notificationVisiblePromise = notificationHost.waitFor({
    state: "visible",
    timeout: 10000,
  });

  // click Apply
  await page.evaluate(() => {
    const popupEl = document.getElementById("corrector-popup");
    const btn = popupEl?.shadowRoot?.querySelector(
      'button[data-action="apply"]'
    );
    if (!btn) throw new Error("No apply button");
    btn.click();
  });

  await expect(editor).toHaveValue("Hello, world!", { timeout: 10000 });

  await notificationVisiblePromise;

  // verify notification text
  const notifText = await page.evaluate(() => {
    const host = document.querySelector("#corrector-notification");
    return host?.shadowRoot?.textContent?.trim() || "";
  });
  expect(notifText).toContain("Text corrected successfully");
});
