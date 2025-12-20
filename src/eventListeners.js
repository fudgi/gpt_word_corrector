import { createPopup } from "./popup.js";
import { directCorrectText } from "./directCorrection.js";
import { removePopup, setLastContextMouse } from "./ui.js";

function isEditableFocused() {
  const a = document.activeElement;
  return (
    a instanceof HTMLTextAreaElement ||
    (a instanceof HTMLInputElement &&
      !["button", "checkbox", "radio", "submit", "file"].includes(a.type)) ||
    (a && a.isContentEditable)
  );
}

function isE2EEnabled() {
  return document.documentElement.getAttribute("data-pw-e2e") === "1";
}

function isLocalhost() {
  return location.hostname === "localhost" || location.hostname === "127.0.0.1";
}

// Event listeners setup
export const setupEventListeners = () => {
  document.addEventListener(
    "contextmenu",
    (e) => setLastContextMouse(e.clientX, e.clientY),
    true
  );

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") removePopup();
  });

  // DOM-level hotkeys ONLY in e2e
  document.addEventListener(
    "keydown",
    (e) => {
      if (!isE2EEnabled()) return;
      if (!isEditableFocused()) return;

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

  // window.postMessage bridge ONLY in e2e + localhost
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (!isE2EEnabled()) return;
    if (!isLocalhost()) return;

    const msg = event.data;
    if (msg?.type !== "__E2E_CONTEXT_MENU_CLICK__") return;

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

  // Click outside popup to close
  document.addEventListener(
    "mousedown",
    (e) => {
      const pop = document.getElementById("corrector-popup");
      if (pop && !pop.contains(e.target)) removePopup();
    },
    true
  );

  // Chrome runtime message listener (prod path)
  chrome.runtime.onMessage.addListener(async (msg) => {
    if (msg?.type === "OPEN_CORRECTOR") {
      const text =
        msg.selectionText || (window.getSelection?.().toString() ?? "");
      await createPopup(text);
    }

    if (msg?.type === "OPEN_CORRECTOR_HOTKEY") {
      if (!document.hasFocus()) return;

      const active = document.activeElement;

      let text = "";
      let source = { kind: "dom-selection" };

      if (
        active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLInputElement &&
          !["button", "checkbox", "radio", "submit", "file"].includes(
            active.type
          ))
      ) {
        const start = active.selectionStart ?? 0;
        const end = active.selectionEnd ?? 0;
        text = active.value.slice(start, end);
        source = { kind: "text-input", start, end };
      } else {
        text = window.getSelection?.().toString() ?? "";
      }

      if (!text.trim()) return;

      directCorrectText({ command: msg.command, text, source });
    }
  });
};
