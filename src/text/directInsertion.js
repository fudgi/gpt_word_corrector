import { getSelectionInfo, applyText } from "./textInsertion.js";
import {
  showLoadingIndicator,
  hideLoadingIndicator,
  showNotification,
} from "../ui/ui.js";
import { successMessageOptions, fallbackMessageOptions } from "../constants.js";

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

function isCurrent(requestId) {
  return requestId === currentRequestId;
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
  const { command, text, source } = payload;

  if (!text || !text.trim()) return;

  // cancel previous (debounce + invalidate in-flight)
  cancelPending();
  const requestId = currentRequestId;

  // IMPORTANT: capture insertion target BEFORE debounce window
  let selectionInfoSnapshot = null;
  if (source?.kind === "text-input") {
    const target = document.activeElement;
    const isTextInput =
      target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLInputElement &&
        !["button", "checkbox", "radio", "submit", "file"].includes(
          target.type
        ));
    if (
      isTextInput &&
      target.isConnected &&
      !target.disabled &&
      !target.readOnly
    ) {
      selectionInfoSnapshot = {
        type: "input",
        element: target,
        start: source.start,
        end: source.end,
      };
    }
  } else {
    selectionInfoSnapshot = getSelectionInfo();
  }

  // If we couldn't even snapshot a target/selection, bail early.
  // This is also a soft replacement for document.hasFocus() in iframe scenarios.
  if (!selectionInfoSnapshot) return;
  try {
    Object.freeze(selectionInfoSnapshot);
  } catch {}

  // Debounce: wait for soft window (200ms) before executing
  // If another request comes in during this window, it will cancel this one
  return new Promise((resolve) => {
    debounceTimer = setTimeout(async () => {
      debounceTimer = null;

      // Check if this request is still current
      if (!isCurrent(requestId)) {
        resolve();
        return;
      }

      try {
        // Show loading indicator with delay (prevents flicker on fast responses/cache)
        loadingDelayTimer = setTimeout(() => {
          // Check if request is still current before showing loader
          if (isCurrent(requestId)) {
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
        if (!isCurrent(requestId)) {
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

        const selectionInfo = selectionInfoSnapshot;
        if (!selectionInfo) {
          // best-effort diagnostics; keep user-noise low
          try {
            console.debug("[corrector] no selection snapshot; skip apply");
          } catch {}
          resolve();
          return;
        }
        // Не блокируем apply по hasFocus: applyText сам восстановит фокус на элемент,
        // а hasFocus() часто флапает на iframe/SPA.

        try {
          if (!isCurrent(requestId)) {
            resolve();
            return;
          }
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
        if (isCurrent(requestId)) {
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
