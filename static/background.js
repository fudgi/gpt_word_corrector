const PROXY_ENDPOINT = "http://localhost:8787/v1/transform";

function generateUUID() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback: generate UUID-like string
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Generate or retrieve install_id
async function getInstallId() {
  const result = await chrome.storage.local.get("install_id");
  if (result.install_id) {
    return result.install_id;
  }

  // Generate new install_id
  const installId = generateUUID();
  await chrome.storage.local.set({ install_id: installId });
  return installId;
}

// Get version from manifest
function getVersion() {
  try {
    return chrome.runtime.getManifest().version || "";
  } catch {
    return "";
  }
}

// Determine channel based on proxy endpoint
function getChannel() {
  const url = PROXY_ENDPOINT.toLowerCase();
  if (url.includes("localhost") || url.includes("127.0.0.1")) {
    return "dev";
  }
  if (url.includes("test")) {
    return "test";
  }
  return "prod";
}

chrome.runtime.onInstalled.addListener(async () => {
  try {
    chrome.contextMenus.create({
      id: "correct-with-gpt",
      title: "Correct",
      contexts: ["editable"],
    });
  } catch {}

  // Generate install_id on first install
  await getInstallId();
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

function isE2EMessage(msg, sender) {
  if (!msg?.__pw_e2e) return false;

  // hardening (optional, but I'd keep it):
  const url = sender?.tab?.url || "";
  return /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg?.type) {
    case "__TEST_CONTEXT_MENU_CLICK__": {
      if (!isE2EMessage(msg, sender)) {
        sendResponse?.({ ok: false, error: "E2E-only" });
        return true;
      }

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
      if (!isE2EMessage(msg, sender)) return;
      const tabId = sender.tab?.id;
      if (!tabId) return;
      void sendHotkey(tabId, msg.command);
      return;
    }

    case "RUN_GPT": {
      void (async () => {
        try {
          const installId = await getInstallId();
          const version = getVersion();
          const channel = getChannel();

          const headers = {
            "Content-Type": "application/json",
            "X-Corrector-Install-Id": installId,
            "X-Corrector-Version": version,
            "X-Corrector-Channel": channel,
          };

          const r = await fetch(PROXY_ENDPOINT, {
            method: "POST",
            headers,
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
