import { test, expect } from "./fixtures";
import { setupBasicTestPage } from "./utils/test-page";

const HOTKEY = process.platform === "darwin" ? "Alt+Shift+P" : "Alt+Shift+P";
const SELECT_ALL = process.platform === "darwin" ? "Meta+A" : "Control+A";

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

test.describe("[textarea] transforms selected text via hotkey", () => {
  test.beforeEach(async () => {
    await waitForProxy();
  });

  test("replaces textarea text with proxy output", async ({ page }) => {
    await setupBasicTestPage(page);

    const textarea = page.locator("#test-textarea");
    await textarea.click();
    await textarea.press(SELECT_ALL);
    await page.keyboard.press(HOTKEY);

    await expect(textarea).toHaveValue(/\[TEST_MODE\]/);

    const finalValue = await textarea.inputValue();
    expect(finalValue).not.toBe("Some sample text");
    expect(finalValue.startsWith("[TEST_MODE] ")).toBeTruthy();
    expect(finalValue).not.toMatch(/<[^>]+>/);
  });
});
