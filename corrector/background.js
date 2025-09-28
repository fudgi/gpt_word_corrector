const PROXY_ENDPOINT = process.env.PROXY_ENDPOINT;

if (!OPENAI_API_KEY) {
  console.error("❌ No PROXY_ENDPOINT found. Add it to .env");
  process.exit(1);
}

// Create context menu item
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "correct-with-gpt",
    title: "Correct",
    contexts: ["editable"],
  });
});

// On click - ask content script to show popup
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "correct-with-gpt" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      type: "OPEN_CORRECTOR",
      selectionText: info.selectionText || "",
    });
  }
});

// Request to proxy on command from content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "RUN_GPT") {
    (async () => {
      try {
        const r = await fetch(PROXY_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: msg.mode, // 'polish' | 'to_en'
            text: msg.text,
            style: "formal", // Always use formal tone
          }),
        });

        if (!r.ok) {
          const errorData = await r.json().catch(() => ({}));
          const errorMsg = errorData.details || `Server error: ${r.status}`;
          throw new Error(errorMsg);
        }

        const data = await r.json();
        sendResponse({
          ok: true,
          output: data.output || "",
          cached: data.cached || false,
        });
      } catch (e) {
        console.error("GPT request failed:", e);
        sendResponse({
          ok: false,
          error: e.message || String(e),
          retryable:
            e.message?.includes("Rate limit") || e.message?.includes("timeout"),
        });
      }
    })();
    return true; // async response
  }
});
