import { test, expect } from "./fixtures";
import http from "node:http";

let pageServer;
let proxyServer;
let baseUrl;

test.beforeAll(async () => {
  // 1) Page server (textarea host)
  pageServer = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(
      `<textarea id="editor" style="width:600px;height:120px;"></textarea>`
    );
  });

  await new Promise((resolve) => pageServer.listen(0, "127.0.0.1", resolve));
  const { port } = pageServer.address();
  baseUrl = `http://127.0.0.1:${port}`;

  // 2) Proxy stub server (matches PROXY_ENDPOINT)
  proxyServer = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/v1/transform") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const parsed = JSON.parse(body || "{}");
        const text = String(parsed.text ?? "");

        // Deterministic correction for the test
        const output = text.replace("helo world", "Hello, world!");

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ output, cached: true }));
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise((resolve) =>
    proxyServer.listen(8787, "127.0.0.1", resolve)
  );
});

test.afterAll(async () => {
  await new Promise((resolve) => pageServer.close(resolve));
  await new Promise((resolve) => proxyServer.close(resolve));
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

  // Trigger DOM-level hotkey
  await page.keyboard.press("Control+Shift+1");

  // Now the stub returns "hello world"
  await expect(editor).toHaveValue("Hello, world!", { timeout: 10000 });

  // Optional: notification appears
  const notification = page.locator("#corrector-notification");
  await expect(notification).toBeVisible({ timeout: 5000 });
});
