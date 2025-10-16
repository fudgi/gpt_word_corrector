import { createPopup } from "./popup.js";
import { directCorrectText } from "./directCorrection.js";
import { removePopup, setLastContextMouse } from "./ui.js";

// Event listeners setup
export const setupEventListeners = () => {
  // Context menu event listener
  document.addEventListener(
    "contextmenu",
    (e) => {
      console.log("contextmenu!!", e);
      setLastContextMouse(e.clientX, e.clientY);
    },
    true
  );

  // Escape key to close popup
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") removePopup();
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
      const text = window.getSelection?.().toString() ?? "";
      if (!text.trim()) return;

      directCorrectText(text, msg.command);
    }
  });
};
