import { createPopup } from "../ui/popup.js";
import { directInsertText } from "../text/directInsertion.js";
import { removePopup, setLastContextMouse } from "../ui/ui.js";

import { registerE2EBridge, registerE2EDomHotkeys } from "./e2eInfra.js";

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
  document.addEventListener(
    "contextmenu",
    (e) => setLastContextMouse(e.clientX, e.clientY),
    true
  );

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") removePopup();
  });

  // E2E infra (само внутри себя проверит e2e-flag + localhost где нужно)
  registerE2EDomHotkeys({ isEditableFocused });
  registerE2EBridge();

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
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "OPEN_CORRECTOR") {
      const text =
        msg.selectionText || (window.getSelection?.().toString() ?? "");
      void createPopup(text);
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

      void directInsertText({ command: msg.command, text, source });
    }
    return false;
  });
};
