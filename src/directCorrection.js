import { sendBg, saveUndoState, initUndoHandler } from "./helpers.js";
import { getSelectionInfo, applyCorrectedText } from "./textInsertion.js";
import { showLoadingIndicator, showNotification } from "./ui.js";
import {
  modeText,
  successMessageOptions,
  fallbackMessageOptions,
} from "./constants.js";

// Initialize the global undo handler
initUndoHandler();

function sendRunGpt(mode, text) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "RUN_GPT", mode, text }, (resp) =>
      resolve(resp)
    );
  });
}

function applyToActiveTextInput(output, start, end) {
  const el = document.activeElement;

  const ok =
    el instanceof HTMLTextAreaElement ||
    (el instanceof HTMLInputElement &&
      !["button", "checkbox", "radio", "submit", "file"].includes(el.type));

  if (!ok) return false;

  // Save state for undo (Cmd+Z / Ctrl+Z)
  saveUndoState(el, start, end);

  el.focus();
  el.setSelectionRange(start, end);

  // Try execCommand first (works in Firefox)
  const success = document.execCommand("insertText", false, output);

  if (!success) {
    // Fallback: direct value manipulation
    const value = el.value;
    el.value = value.slice(0, start) + output + value.slice(end);
    const caret = start + output.length;
    el.setSelectionRange(caret, caret);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  return true;
}

export async function directCorrectText(payload) {
  const { command, text, source } = payload;

  // 1) call background proxy
  const resp = await sendRunGpt(command, text);
  if (!resp?.ok) {
    showNotification(
      `❌ Correction failed: ${resp?.error || "Unknown error"}`,
      "error"
    );
    return;
  }

  const output = resp.output ?? "";
  if (!output) return;

  // 2) apply result
  if (source?.kind === "text-input") {
    const applied = applyToActiveTextInput(output, source.start, source.end);
    if (!applied) {
      return;
    }

    // 3) show notification
    const successMessage = successMessageOptions[command];
    showNotification(successMessage, "success");
    return;
  }

  // fallback for dom selection/contenteditable
  const selectionInfo = getSelectionInfo();
  if (!selectionInfo) {
    return;
  }

  try {
    const success = applyCorrectedText(selectionInfo, output);

    if (success) {
      const successMessage = successMessageOptions[command];
      showNotification(successMessage, "success");
    } else {
      const fallbackMessage = fallbackMessageOptions[command];
      showNotification(fallbackMessage, "info");
    }
  } catch (e) {
    showNotification(`❌ Connection error: ${e.message}`, "error");
  }
}
