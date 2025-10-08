if (window.__corrector_bound) {
  console.debug("[Corrector] already bound, skipping duplicate injection");
}
window.__corrector_bound = true;

let lastContextMouse = { x: 0, y: 0 };

const modeText = {
  polish: "✏️ polishing text...",
  to_en: "✏️ translating text...",
};

const successMessageOptions = {
  polish: "✅ Text corrected successfully!",
  to_en: "✅ Text translated successfully!",
};

const fallbackMessageOptions = {
  polish: "📋 Corrected text copied to clipboard",
  to_en: "📋 Translated text copied to clipboard",
};

// --- helpers ---
const getCurrentRange = () => {
  const sel = window.getSelection?.();
  if (!sel || sel.rangeCount === 0) return null;
  return sel.getRangeAt(0);
};

const sendBg = (message, attempts = 2) => {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (res) => {
      const err = chrome.runtime.lastError;
      if (err) return reject(new Error(err.message));
      resolve(res);
    });
  }).catch(async (e) => {
    if (attempts <= 0) throw e;
    await new Promise((r) => setTimeout(r, 500));
    return sendBg(message, attempts - 1);
  });
};

const dispatchTextInputEvents = (target, text) => {
  try {
    target.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: text,
      })
    );
  } catch {}
  try {
    target.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        cancelable: false,
        inputType: "insertText",
        data: text,
      })
    );
  } catch {}
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
  showNotification(message, "loading", 0); // 0 duration means no auto-remove
};

const getSelectionInfo = () => {
  const activeAtOpen = document.activeElement;

  if (
    activeAtOpen &&
    (activeAtOpen.tagName === "TEXTAREA" ||
      (activeAtOpen.tagName === "INPUT" &&
        ["text", "search"].includes(activeAtOpen.type || "text")))
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
    if (ok) dispatchTextInputEvents(selectionInfo.element, correctedText);
  } else if (selectionInfo?.type === "contentEditable") {
    ok = insertIntoContentEditableBySavedRange(selectionInfo, correctedText);
    if (ok) dispatchTextInputEvents(selectionInfo.element, correctedText);
  } else if (selectionInfo?.type === "document") {
    ok = insertIntoDocumentRange(selectionInfo, correctedText);
    if (ok)
      dispatchTextInputEvents(
        document.activeElement || document.body,
        correctedText
      );
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

  showLoadingIndicator(modeText[mode]);

  try {
    const resp = await sendBg({
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
      const successMessage = successMessageOptions[mode];
      showNotification(successMessage, "success");
    } else {
      const fallbackMessage = fallbackMessageOptions[mode];
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
  div.addEventListener("mousedown", (e) => e.preventDefault());
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

  const runLLM = async () => {
    const status = div.querySelector(".status");
    const result = div.querySelector(".result");
    const applyBtn = div.querySelector('[data-action="apply"]');

    if (!originalText?.trim()) {
      status.textContent = "No text to process";
      result.style.display = "none";
      applyBtn.disabled = true;
      return;
    }

    status.textContent = modeText[mode];
    result.style.display = "none";
    applyBtn.disabled = true;

    try {
      const resp = await sendBg({
        type: "RUN_GPT",
        mode,
        text: originalText,
        style,
      });

      if (!resp?.ok) {
        status.textContent = `❌ Error: ${resp?.error || "unknown"}`;
        return;
      }

      lastOutput = resp.output || "";
      const cacheIndicator = resp.cached ? " (cached)" : "";
      status.textContent = `${successMessageOptions[mode]}${cacheIndicator}`;
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
