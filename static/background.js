const PROXY_ENDPOINT = "http://localhost:8787/v1/transform";

chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.contextMenus.create({
      id: "correct-with-gpt",
      title: "Correct",
      contexts: ["editable"],
    });
  } catch {}
});

async function openCorrector(tabId, selectionText = "", frameId) {
  if (!tabId) return false;

  const msg = { type: "OPEN_CORRECTOR", selectionText };
  try {
    if (typeof frameId === "number") {
      await chrome.tabs.sendMessage(tabId, msg, { frameId });
    } else {
      await chrome.tabs.sendMessage(tabId, msg);
    }
    return true;
  } catch {
    return false;
  }
}

async function sendHotkey(tabId, command) {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "OPEN_CORRECTOR_HOTKEY",
      command,
    });
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"],
      });
      await chrome.tabs.sendMessage(tabId, {
        type: "OPEN_CORRECTOR_HOTKEY",
        command,
      });
    } catch {
      // swallow errors to prevent unhandled rejections
    }
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "correct-with-gpt" || !tab?.id) return;
  void openCorrector(tab.id, info.selectionText || "", info.frameId);
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (!tab?.id) return;
  const url = tab.url || "";
  if (/^(chrome|edge|about|chrome-extension):/i.test(url)) return;
  void sendHotkey(tab.id, command);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg?.type) {
    case "__TEST_CONTEXT_MENU_CLICK__": {
      const tabId = sender.tab?.id;
      void (async () => {
        const ok = await openCorrector(
          tabId,
          msg.selectionText || "",
          msg.frameId
        );
        sendResponse(
          ok ? { ok: true } : { ok: false, error: "openCorrector failed" }
        );
      })();
      return true;
    }

    case "OPEN_CORRECTOR_DOM_HOTKEY": {
      const tabId = sender.tab?.id;
      if (!tabId) return;
      void sendHotkey(tabId, msg.command);
      return;
    }

    case "RUN_GPT": {
      void (async () => {
        try {
          const r = await fetch(PROXY_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: msg.mode,
              text: msg.text,
              style: "formal",
            }),
          });

          if (!r.ok) {
            const errorData = await r.json().catch(() => ({}));
            throw new Error(errorData.details || `Server error: ${r.status}`);
          }

          const data = await r.json();
          sendResponse({
            ok: true,
            output: data.output || "",
            cached: data.cached || false,
          });
        } catch (e) {
          sendResponse({
            ok: false,
            error: e.message || String(e),
            retryable:
              e.message?.includes("Rate limit") ||
              e.message?.includes("timeout"),
          });
        }
      })();
      return true;
    }

    default:
      return;
  }
});
