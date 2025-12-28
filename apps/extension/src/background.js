const PROXY_ENDPOINT = __PROXY_ENDPOINT__;
const STORAGE_KEYS = {
  installId: "install_id",
  installToken: "install_token",
  installTokenIssuedAt: "install_token_issued_at",
};

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
  const result = await chrome.storage.local.get(STORAGE_KEYS.installId);
  if (result[STORAGE_KEYS.installId]) {
    return result[STORAGE_KEYS.installId];
  }

  // Generate new install_id
  const installId = generateUUID();
  await chrome.storage.local.set({ [STORAGE_KEYS.installId]: installId });
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

function getRegisterEndpoint() {
  const url = new URL(PROXY_ENDPOINT);
  url.pathname = "/v1/register";
  url.search = "";
  return url.toString();
}

function getRetryAfterMs(response) {
  const retryAfter = response.headers?.get?.("Retry-After");
  if (!retryAfter) return 0;
  const seconds = Number(retryAfter);
  if (!Number.isNaN(seconds)) {
    return Math.max(0, seconds * 1000);
  }
  return 0;
}

function normalizeErrorPayload(payload, fallbackCode = "INTERNAL") {
  const error = payload?.error || {};
  return {
    code: error.code || fallbackCode,
    message: error.message || "Unknown error",
    retry_after_ms: Number(error.retry_after_ms) || 0,
  };
}

function isRetryable(code, context) {
  const normalized = String(code || "").toUpperCase();
  if (
    ["RATE_LIMITED", "UPSTREAM_TIMEOUT", "UPSTREAM_UNAVAILABLE", "NETWORK_ERROR"].includes(
      normalized
    )
  ) {
    return true;
  }
  if (normalized === "UNAUTHORIZED") {
    return Boolean(context?.allowUnauthorizedRetry);
  }
  return false;
}

async function registerInstallToken() {
  const installId = await getInstallId();
  const version = getVersion();
  const r = await fetch(getRegisterEndpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      install_id: installId,
      version,
    }),
  });

  let payload = null;
  try {
    payload = await r.json();
  } catch {
    payload = null;
  }

  if (!r.ok) {
    const normalized = normalizeErrorPayload(payload, "INTERNAL");
    normalized.retry_after_ms =
      normalized.retry_after_ms || getRetryAfterMs(r);
    throw normalized;
  }

  const token = payload?.install_token;
  if (!token || typeof token !== "string") {
    throw {
      code: "INTERNAL",
      message: "Invalid register response",
      retry_after_ms: 0,
    };
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.installToken]: token,
    [STORAGE_KEYS.installTokenIssuedAt]: Date.now(),
  });

  return token;
}

async function getInstallToken() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.installToken);
  if (result[STORAGE_KEYS.installToken]) {
    return result[STORAGE_KEYS.installToken];
  }
  return registerInstallToken();
}

async function clearInstallToken() {
  await chrome.storage.local.remove([
    STORAGE_KEYS.installToken,
    STORAGE_KEYS.installTokenIssuedAt,
  ]);
}

async function fetchJson(url, options) {
  try {
    const r = await fetch(url, options);
    let payload = null;
    try {
      payload = await r.json();
    } catch {
      payload = null;
    }

    if (!r.ok) {
      const normalized = normalizeErrorPayload(payload, "INTERNAL");
      normalized.retry_after_ms =
        normalized.retry_after_ms || getRetryAfterMs(r);
      return { ok: false, error: normalized, status: r.status };
    }

    return { ok: true, payload };
  } catch (e) {
    return {
      ok: false,
      error: {
        code: "NETWORK_ERROR",
        message: e?.message || String(e),
        retry_after_ms: 0,
      },
      status: 0,
    };
  }
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
          let token;
          try {
            token = await getInstallToken();
          } catch (error) {
            const normalized =
              typeof error === "object" && error?.code
                ? error
                : {
                    code: "INTERNAL",
                    message: "Failed to register install token",
                    retry_after_ms: 0,
                  };
            sendResponse({
              ok: false,
              error: normalized,
              retryable: isRetryable(normalized.code),
            });
            return;
          }

          const headers = {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "X-Corrector-Install-Id": installId,
            "X-Corrector-Version": version,
            "X-Corrector-Channel": channel,
          };

          const makeRequest = () =>
            fetchJson(PROXY_ENDPOINT, {
              method: "POST",
              headers,
              body: JSON.stringify({
                mode: msg.mode,
                text: msg.text,
                style: "formal",
                install_id: installId,
              }),
            });

          let result = await makeRequest();
          let retriedUnauthorized = false;

          if (!result.ok && result.error.code === "UNAUTHORIZED") {
            retriedUnauthorized = true;
            await clearInstallToken();
            try {
              token = await registerInstallToken();
              headers.Authorization = `Bearer ${token}`;
              result = await makeRequest();
            } catch (error) {
              const normalized =
                typeof error === "object" && error?.code
                  ? error
                  : {
                      code: "INTERNAL",
                      message: "Failed to register install token",
                      retry_after_ms: 0,
                    };
              sendResponse({
                ok: false,
                error: normalized,
                retryable: isRetryable(normalized.code),
              });
              return;
            }
          }

          if (!result.ok) {
            const retryable = isRetryable(result.error.code, {
              allowUnauthorizedRetry: !retriedUnauthorized,
            });
            sendResponse({
              ok: false,
              error: result.error,
              retryable,
            });
            return;
          }

          if (!result.payload || typeof result.payload !== "object") {
            sendResponse({
              ok: false,
              error: {
                code: "INTERNAL",
                message: "Invalid response",
                retry_after_ms: 0,
              },
              retryable: false,
            });
            return;
          }

          sendResponse({
            ok: true,
            output: result.payload.output || "",
            cached: result.payload.cached || false,
          });
        } catch (e) {
          sendResponse({
            ok: false,
            error: {
              code: "INTERNAL",
              message: e?.message || String(e),
              retry_after_ms: 0,
            },
            retryable: false,
          });
        }
      })();
      return true;
    }

    default:
      return;
  }
});
