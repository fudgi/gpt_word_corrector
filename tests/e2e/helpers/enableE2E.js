// Enable E2E mode by setting DOM attribute (visible to content scripts)
// Must be called AFTER page.goto() when DOM is available
export async function enableE2E(page) {
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-pw-e2e", "1");
  });
}
