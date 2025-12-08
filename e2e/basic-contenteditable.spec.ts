import { test, expect } from "./fixtures";
import { setupBasicTestPage } from "./utils/test-page";

const SELECT_ALL = process.platform === "darwin" ? "Meta+A" : "Control+A";

async function triggerContextMenuFlow(page) {
  await page.evaluate(() => {
    window.postMessage({ type: "CORRECTOR_DEBUG_CONTEXT", mode: "polish" });
  });
}

async function waitForProxy() {
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch("http://localhost:8787/v1/transform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "ping" }),
      });
      if (res.ok) return;
    } catch (err) {
      // retry
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Proxy server is not responding on http://localhost:8787/v1/transform");
}

test.describe("[contentEditable] transforms selected text via debug context-menu trigger", () => {
  test.beforeEach(async () => {
    await waitForProxy();
  });

  test("replaces contenteditable text", async ({ page }) => {
    await setupBasicTestPage(page);

    const editable = page.locator("#test-contenteditable");
    await editable.click();
    await editable.dblclick();
    await editable.press(SELECT_ALL);

    await triggerContextMenuFlow(page);

    await expect(editable).toHaveText(/\[TEST_MODE\]/);

    const finalText = await editable.innerText();
    expect(finalText).not.toBe("Some editable text");
    expect(finalText.startsWith("[TEST_MODE] ")).toBeTruthy();
    expect(finalText).not.toMatch(/<[^>]+>/);
  });
});
