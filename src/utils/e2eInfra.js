export const E2E_ATTR = "data-pw-e2e";

export function isE2EEnabled() {
  try {
    return document?.documentElement?.getAttribute(E2E_ATTR) === "1";
  } catch {
    return false;
  }
}

export function isLocalhostHost(hostname = location.hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

/**
 * Registers E2E-only bridge: page -> content -> background.
 * Gated by:
 *  - isE2EEnabled() === true
 *  - localhost/127.0.0.1
 */
export function registerE2EBridge() {
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (!isE2EEnabled()) return;
    if (!isLocalhostHost()) return;

    const msg = event.data;
    if (!msg || typeof msg !== "object") return;
    if (msg.type !== "__E2E_CONTEXT_MENU_CLICK__") return;

    chrome.runtime.sendMessage(
      {
        type: "__TEST_CONTEXT_MENU_CLICK__",
        selectionText: msg.selectionText || "",
        frameId: typeof msg.frameId === "number" ? msg.frameId : undefined,
        __pw_e2e: true,
      },
      (resp) => {
        window.postMessage(
          { type: "__E2E_CONTEXT_MENU_CLICK_RESULT__", resp },
          "*"
        );
      }
    );
  });
}

/**
 * Registers E2E-only DOM hotkeys (Ctrl+Shift+1/2) to simulate chrome.commands in tests.
 * Gated by isE2EEnabled().
 */
export function registerE2EDomHotkeys({ isEditableFocused }) {
  document.addEventListener(
    "keydown",
    (e) => {
      if (!isE2EEnabled()) return;
      if (!isEditableFocused?.()) return;

      if (e.ctrlKey && e.shiftKey && e.key === "1") {
        e.preventDefault();
        e.stopPropagation();
        chrome.runtime.sendMessage({
          type: "OPEN_CORRECTOR_DOM_HOTKEY",
          command: "polish",
          __pw_e2e: true,
        });
        return;
      }

      if (e.ctrlKey && e.shiftKey && e.key === "2") {
        e.preventDefault();
        e.stopPropagation();
        chrome.runtime.sendMessage({
          type: "OPEN_CORRECTOR_DOM_HOTKEY",
          command: "to_en",
          __pw_e2e: true,
        });
      }
    },
    true
  );
}
