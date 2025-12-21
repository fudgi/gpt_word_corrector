import { getSelectionInfo, applyText } from "./textInsertion.js";
import {
  showLoadingIndicator,
  hideLoadingIndicator,
  showNotification,
} from "./ui.js";
import { successMessageOptions, fallbackMessageOptions } from "./constants.js";

// Debounce/cooldown state
let currentRequestId = 0;
let debounceTimer = null;
let loadingDelayTimer = null;
const DEBOUNCE_WINDOW_MS = 200;
const LOADING_DELAY_MS = 120; // Minimum delay before showing loader (prevents flicker on fast responses)

function cancelPending() {
  currentRequestId++;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (loadingDelayTimer) {
    clearTimeout(loadingDelayTimer);
    loadingDelayTimer = null;
  }
  // prevent stuck loader if previous request was showing it
  hideLoadingIndicator();
}

function sendRunGpt(mode, text) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "RUN_GPT", mode, text }, (resp) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve(resp);
    });
  });
}

export async function directInsertText(payload) {
  if (!document.hasFocus()) return;
  const { command, text, source } = payload;

  if (!text || !text.trim()) return;

  // cancel previous (debounce + invalidate in-flight)
  cancelPending();
  const requestId = currentRequestId;

  // IMPORTANT: capture insertion target BEFORE debounce window
  const activeEl = document.activeElement;
  const selectionInfoSnapshot =
    source?.kind === "text-input" ? null : getSelectionInfo();

  // Debounce: wait for soft window (200ms) before executing
  // If another request comes in during this window, it will cancel this one
  return new Promise((resolve) => {
    debounceTimer = setTimeout(async () => {
      debounceTimer = null;

      // Check if this request is still current
      if (requestId !== currentRequestId) {
        resolve();
        return;
      }

      try {
        // Show loading indicator with delay (prevents flicker on fast responses/cache)
        loadingDelayTimer = setTimeout(() => {
          // Check if request is still current before showing loader
          if (requestId === currentRequestId) {
            showLoadingIndicator("Processing...");
          }
          loadingDelayTimer = null;
        }, LOADING_DELAY_MS);

        // 1) call background proxy
        const resp = await sendRunGpt(command, text);

        // Cancel loading delay if response came quickly
        if (loadingDelayTimer) {
          clearTimeout(loadingDelayTimer);
          loadingDelayTimer = null;
        }

        // Check again if request is still current (might have been superseded)
        if (requestId !== currentRequestId) {
          resolve();
          return;
        }

        if (!resp?.ok) {
          showNotification(
            `❌ Correction failed: ${resp?.error || "Unknown error"}`,
            "error"
          );
          resolve();
          return;
        }

        const output = resp.output ?? "";
        if (!output) {
          resolve();
          return;
        }

        // 2) apply result
        if (source?.kind === "text-input") {
          // Guard against null/body - fallback to current activeElement if needed
          const target =
            !activeEl || activeEl === document.body
              ? document.activeElement
              : activeEl;
          const isTextInput =
            target instanceof HTMLTextAreaElement ||
            (target instanceof HTMLInputElement &&
              !["button", "checkbox", "radio", "submit", "file"].includes(
                target.type
              ));
          if (!target || !isTextInput) {
            resolve();
            return;
          }

          const selectionInfo = {
            type: "input",
            element: target,
            start: source.start,
            end: source.end,
          };

          const applied = applyText(selectionInfo, output);
          if (!applied) {
            resolve();
            return;
          }

          // 3) show notification
          const successMessage = successMessageOptions[command];
          showNotification(successMessage, "success");
          resolve();
          return;
        }

        // fallback for dom selection/contenteditable
        const selectionInfo = selectionInfoSnapshot;
        if (!selectionInfo) {
          resolve();
          return;
        }
        if (!document.hasFocus()) {
          resolve();
          return;
        }

        try {
          const success = applyText(selectionInfo, output);

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
      } catch (e) {
        // Only show error if this is still the current request
        if (requestId === currentRequestId) {
          showNotification(`❌ Connection error: ${e.message}`, "error");
        }
      } finally {
        // Cancel loading delay timer if still pending
        if (loadingDelayTimer) {
          clearTimeout(loadingDelayTimer);
          loadingDelayTimer = null;
        }
        // Hide loading indicator (idempotent - safe to call even if already hidden)
        hideLoadingIndicator();
      }

      resolve();
    }, DEBOUNCE_WINDOW_MS);
  });
}
