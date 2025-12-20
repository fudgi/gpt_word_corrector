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

// Event listeners setup
export const setupEventListeners = () => {
  // Context menu event listener
  document.addEventListener(
    "contextmenu",
    (e) => {
      setLastContextMouse(e.clientX, e.clientY);
    },
    true
  );

  // Escape key to close popup
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") removePopup();
  });

  // DOM-level hotkey handling for Playwright tests (capture phase)
  document.addEventListener(
    "keydown",
    (e) => {
      // Only handle when editable element is focused
      if (!isEditableFocused()) return;

      // Ctrl+Shift+1 → polish
      if (e.ctrlKey && e.shiftKey && e.key === "1") {
        e.preventDefault();
        e.stopPropagation();
        chrome.runtime.sendMessage({
          type: "OPEN_CORRECTOR_DOM_HOTKEY",
          command: "polish",
        });
        return;
      }
      // Ctrl+Shift+2 → to_en
      if (e.ctrlKey && e.shiftKey && e.key === "2") {
        e.preventDefault();
        e.stopPropagation();
        chrome.runtime.sendMessage({
          type: "OPEN_CORRECTOR_DOM_HOTKEY",
          command: "to_en",
        });
        return;
      }
    },
    true // capture phase
  );

  // E2E test bridge: page -> content -> background
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const msg = event.data;

    // Only allow on localhost/127.0.0.1 for security
    if (
      !location.hostname.startsWith("127.0.0.1") &&
      location.hostname !== "localhost"
    )
      return;

    if (msg?.type === "__E2E_CONTEXT_MENU_CLICK__") {
      try {
        chrome.runtime.sendMessage(
          {
            type: "__TEST_CONTEXT_MENU_CLICK__",
            selectionText: msg.selectionText || "",
            frameId: msg.frameId,
          },
          (resp) => {
            window.postMessage(
              { type: "__E2E_CONTEXT_MENU_CLICK_RESULT__", resp },
              "*"
            );
          }
        );
      } catch (e) {
        window.postMessage(
          {
            type: "__E2E_CONTEXT_MENU_CLICK_RESULT__",
            resp: { ok: false, error: String(e) },
          },
          "*"
        );
      }
    }
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

  // Chrome runtime message listener
  chrome.runtime.onMessage.addListener(async (msg) => {
    if (msg?.type === "OPEN_CORRECTOR") {
      const text =
        msg.selectionText || (window.getSelection?.().toString() ?? "");
      await createPopup(text);
    }
    if (msg?.type === "OPEN_CORRECTOR_HOTKEY") {
      if (!document.hasFocus()) return;

      // Prefer selection from focused editable element (textarea/input/contenteditable)
      const active = document.activeElement;

      let text = "";
      let source = { kind: "dom-selection" };

      // textarea / input
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
        // fallback: normal page selection
        text = window.getSelection?.().toString() ?? "";
        source = { kind: "dom-selection" };
      }

      if (!text.trim()) return;

      directCorrectText({
        command: msg.command,
        text,
        source,
      });
    }
  });
};
