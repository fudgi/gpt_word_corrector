let lastContextMouse = { x: 0, y: 0 };

// --- helpers ---
const getCurrentRange = () => {
  const sel = window.getSelection?.();
  if (!sel || sel.rangeCount === 0) return null;
  return sel.getRangeAt(0);
};

// Insert into input/textarea by saved coordinates
const insertIntoInputBySavedSelection = (info, text) => {
  const el = info?.element;
  if (!el || el.disabled || el.readOnly) return false;
  el.focus({ preventScroll: true });
  const start = info.start ?? el.selectionStart ?? 0;
  const end = info.end ?? el.selectionEnd ?? 0;
  const before = el.value.slice(0, start);
  const after = el.value.slice(end);
  el.value = before + text + after;
  const caret = before.length + text.length;
  el.setSelectionRange(caret, caret);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
};

// Insert into contentEditable by saved Range
const insertIntoContentEditableBySavedRange = (info, text) => {
  const el = info?.element;
  const saved = info?.range;
  if (!el || !el.isContentEditable || !saved) return false;
  el.focus({ preventScroll: true });

  const sel = window.getSelection();
  sel.removeAllRanges();
  const range = saved.cloneRange();
  sel.addRange(range);

  // Try native method
  const ok = document.execCommand("insertText", false, text);
  if (ok) return true;

  // Fallback: manual replacement
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  // Set cursor after insertion
  sel.removeAllRanges();
  const after = document.createRange();
  after.setStartAfter(node);
  after.collapse(true);
  sel.addRange(after);
  return true;
};

// Insert into arbitrary document Range
const insertIntoDocumentRange = (info, text) => {
  const saved = info?.range;
  if (!saved) return false;
  const sel = window.getSelection();
  sel.removeAllRanges();
  const range = saved.cloneRange();
  sel.addRange(range);
  range.deleteContents();
  range.insertNode(document.createTextNode(text));
  return true;
};

const removePopup = () => {
  document.getElementById("corrector-popup")?.remove();
};

// Show notification to user
const showNotification = (message, type = "info", duration = 3000) => {
  // Remove existing notification
  document.getElementById("corrector-notification")?.remove();

  const notification = document.createElement("div");
  notification.id = "corrector-notification";
  notification.textContent = message;
  notification.classList.add(type);

  // Position notification near cursor or center of screen
  const x = lastContextMouse.x + window.scrollX + 8;
  const y = lastContextMouse.y + window.scrollY + 8;

  Object.assign(notification.style, {
    left: `${x}px`,
    top: `${y}px`,
  });

  document.body.appendChild(notification);

  // Auto remove after duration
  setTimeout(() => {
    notification.remove();
  }, duration);
};

// Show loading indicator
const showLoadingIndicator = (message = "Processing...") => {
  // Remove existing notification
  document.getElementById("corrector-notification")?.remove();

  const notification = document.createElement("div");
  notification.id = "corrector-notification";
  notification.textContent = message;
  notification.classList.add("loading", "info");

  // Position notification near cursor or center of screen
  const x = lastContextMouse.x + window.scrollX + 8;
  const y = lastContextMouse.y + window.scrollY + 8;

  Object.assign(notification.style, {
    left: `${x}px`,
    top: `${y}px`,
  });

  document.body.appendChild(notification);
};

// Get selection info for current context (used in 2 places)
const getSelectionInfo = () => {
  const activeAtOpen = document.activeElement;

  if (
    activeAtOpen &&
    (activeAtOpen.tagName === "TEXTAREA" ||
      (activeAtOpen.tagName === "INPUT" &&
        ["text", "search", "email", "url", "tel", "password"].includes(
          activeAtOpen.type || "text"
        )))
  ) {
    return {
      type: "input",
      element: activeAtOpen,
      start: activeAtOpen.selectionStart ?? 0,
      end: activeAtOpen.selectionEnd ?? 0,
    };
  } else if (activeAtOpen && activeAtOpen.isContentEditable) {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      return {
        type: "contentEditable",
        element: activeAtOpen,
        range: sel.getRangeAt(0).cloneRange(),
      };
    }
  } else {
    const r = getCurrentRange();
    if (r) {
      return { type: "document", range: r.cloneRange() };
    }
  }

  return null;
};

const applyCorrectedText = (selectionInfo, correctedText) => {
  let ok = false;
  if (selectionInfo?.type === "input") {
    ok = insertIntoInputBySavedSelection(selectionInfo, correctedText);
  } else if (selectionInfo?.type === "contentEditable") {
    ok = insertIntoContentEditableBySavedRange(selectionInfo, correctedText);
  } else if (selectionInfo?.type === "document") {
    ok = insertIntoDocumentRange(selectionInfo, correctedText);
  }

  if (!ok) {
    // Fallback: put in clipboard
    navigator.clipboard.writeText(correctedText);
  }

  return ok;
};

const directCorrectText = async (text, mode) => {
  if (!text?.trim()) return;

  const selectionInfo = getSelectionInfo();

  // Show loading message
  const modeText = mode === "polish" ? "polishing" : "translating";
  showLoadingIndicator(`✏️ ${modeText} text...`);

  try {
    const resp = await chrome.runtime.sendMessage({
      type: "RUN_GPT",
      mode,
      text,
      style: "formal",
    });

    if (!resp?.ok) {
      console.error("Correction failed:", resp?.error);
      showNotification(
        `❌ Correction failed: ${resp?.error || "Unknown error"}`,
        "error"
      );
      return;
    }

    const correctedText = resp.output || "";
    if (!correctedText) {
      showNotification("❌ No correction result received", "error");
      return;
    }

    // Apply the correction
    const success = applyCorrectedText(selectionInfo, correctedText);

    if (success) {
      const successMessage =
        mode === "polish"
          ? "✅ Text corrected successfully!"
          : "✅ Text translated successfully!";
      showNotification(successMessage, "success");
    } else {
      const fallbackMessage =
        mode === "polish"
          ? "📋 Corrected text copied to clipboard"
          : "📋 Translated text copied to clipboard";
      showNotification(fallbackMessage, "info");
    }
  } catch (e) {
    console.error("Direct correction error:", e);
    showNotification(`❌ Connection error: ${e.message}`, "error");
  }
};

// --- main ---
const createPopup = (initialText) => {
  removePopup();

  const div = document.createElement("div");
  div.id = "corrector-popup";
  div.innerHTML = `
    <div class="row">
      <button data-mode="polish" title="Improve grammar and style">Polish</button>
      <button data-mode="to_en" title="Translate to English">To English</button>
    </div>
    <div class="status">Selected: ${
      initialText
        ? initialText.slice(0, 80) + (initialText.length > 80 ? "…" : "")
        : "(empty)"
    }</div>
    <div class="result" style="display:none;"></div>
    <div class="actions">
      <button data-action="apply" disabled>Apply</button>
    </div>
  `;

  Object.assign(div.style, {
    position: "absolute",
    left: `${lastContextMouse.x + window.scrollX + 8}px`,
    top: `${lastContextMouse.y + window.scrollY + 8}px`,
    zIndex: 2147483647,
  });

  document.body.appendChild(div);

  let mode = "polish";
  let style = "formal";
  let originalText = initialText || (window.getSelection?.().toString() ?? "");
  let lastOutput = "";

  // 📌 Save original insertion location
  const selectionInfo = getSelectionInfo();

  // Visual for active mode button
  const updateActiveButtons = () => {
    div.querySelectorAll("button[data-mode]").forEach((b) => {
      b.classList.toggle("active", b.getAttribute("data-mode") === mode);
    });
  };

  div.querySelectorAll("button[data-mode]").forEach((b) => {
    b.addEventListener("click", async () => {
      mode = b.getAttribute("data-mode");
      updateActiveButtons();
      await runLLM();
    });
  });
  updateActiveButtons();

  // 👉 Important: first remove popup (so it doesn't interfere with click/insert),
  // then in next tick restore and insert
  div.querySelector('[data-action="apply"]').onclick = () => {
    if (!lastOutput) return;
    removePopup();
    // give engine one tick to refocus after DOM removal
    setTimeout(() => {
      applyCorrectedText(selectionInfo, lastOutput);
    }, 0);
  };

  const runLLM = async (retryCount = 0) => {
    const status = div.querySelector(".status");
    const result = div.querySelector(".result");
    const applyBtn = div.querySelector('[data-action="apply"]');

    if (!originalText?.trim()) {
      status.textContent = "No text to process";
      result.style.display = "none";
      applyBtn.disabled = true;
      return;
    }

    const isRetry = retryCount > 0;
    const modeText = mode === "polish" ? "polishing" : "translating";
    status.textContent = isRetry
      ? `🔄 Retry ${retryCount}...`
      : `✏️ ${modeText} text...`;
    result.style.display = "none";
    applyBtn.disabled = true;

    try {
      const resp = await chrome.runtime.sendMessage({
        type: "RUN_GPT",
        mode,
        text: originalText,
        style,
      });

      if (!resp?.ok) {
        // Retry for rate limit errors
        if (resp?.retryable && retryCount < 2) {
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 * (retryCount + 1))
          );
          return runLLM(retryCount + 1);
        }
        status.textContent = `❌ Error: ${resp?.error || "unknown"}`;
        return;
      }

      lastOutput = resp.output || "";
      const cacheIndicator = resp.cached ? " (cached)" : "";
      status.textContent = `✅ ${mode} (formal)${cacheIndicator}`;
      result.textContent = lastOutput;
      result.style.display = "block";
      applyBtn.disabled = !lastOutput;
    } catch (e) {
      status.textContent = `❌ Connection error: ${e.message}`;
    }
  };

  runLLM();
};

// open popup on signal
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "OPEN_CORRECTOR") {
    const text =
      msg.selectionText || (window.getSelection?.().toString() ?? "");
    createPopup(text);
  }
  if (msg?.type === "OPEN_CORRECTOR_HOTKEY") {
    if (!document.hasFocus()) return;
    const text = window.getSelection?.().toString() ?? "";
    if (!text.trim()) return;

    directCorrectText(text, msg.command);
  }
});

document.addEventListener(
  "contextmenu",
  (e) => {
    console.log("contextmenu!!", e);
    lastContextMouse = { x: e.clientX, y: e.clientY };
  },
  true
);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") removePopup();
});

document.addEventListener(
  "mousedown",
  (e) => {
    const pop = document.getElementById("corrector-popup");
    if (pop && !pop.contains(e.target)) removePopup();
  },
  true
);
