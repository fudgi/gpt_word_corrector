import { Page } from "@playwright/test";

export async function setupBasicTestPage(page: Page) {
  await page.addInitScript(() => {
    (window as any).__CORRECTOR_TEST__ = true;
  });

  await page.goto("https://example.com");
  await page.waitForLoadState("domcontentloaded");

  await page.evaluate(() => {
    document.body.innerHTML = `
      <main style="padding: 24px; display: grid; gap: 16px; max-width: 640px; margin: 0 auto;">
        <h1>Corrector Test Page</h1>
        <label for="test-textarea">Textarea</label>
        <textarea id="test-textarea" rows="4" style="width: 100%;">Some sample text</textarea>
        <label for="test-contenteditable">ContentEditable</label>
        <div id="test-contenteditable" contenteditable="true" style="min-height: 100px; border: 1px solid #ccc; padding: 8px;">Some editable text</div>
      </main>
    `;
  });
}
