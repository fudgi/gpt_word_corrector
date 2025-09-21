let lastContextMouse = { x: 0, y: 0 };
document.addEventListener(
  "contextmenu",
  (e) => {
    lastContextMouse = { x: e.clientX, y: e.clientY };
  },
  true
);

// --- helpers ---
function getCurrentRange() {
  const sel = window.getSelection?.();
  if (!sel || sel.rangeCount === 0) return null;
  return sel.getRangeAt(0);
}

// Insert into input/textarea by saved coordinates
function insertIntoInputBySavedSelection(info, text) {
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
}

// Insert into contentEditable by saved Range
function insertIntoContentEditableBySavedRange(info, text) {
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
}

// Insert into arbitrary document Range
function insertIntoDocumentRange(info, text) {
  const saved = info?.range;
  if (!saved) return false;
  const sel = window.getSelection();
  sel.removeAllRanges();
  const range = saved.cloneRange();
  sel.addRange(range);
  range.deleteContents();
  range.insertNode(document.createTextNode(text));
  return true;
}

function removePopup() {
  document.getElementById("corrector-popup")?.remove();
}

// --- main ---
function createPopup(initialText) {
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
      <button data-action="copy"  disabled>Copy</button>
      <button data-action="close">Close</button>
    </div>
  `;

  Object.assign(div.style, {
    position: "absolute",
    left: `${lastContextMouse.x + window.scrollX + 8}px`,
    top: `${lastContextMouse.y + window.scrollY + 8}px`,
    zIndex: 2147483647,
  });

  document.body.appendChild(div);

  // 🔒 DON'T GIVE FOCUS to popup: keep input field active
  div.addEventListener("mousedown", (e) => {
    e.preventDefault(); // blocks focus transfer to button
  });

  let mode = "polish";
  let style = "formal";
  let originalText = initialText || (window.getSelection?.().toString() ?? "");
  let lastOutput = "";

  // 📌 Save original insertion location
  let selectionInfo = null;
  const activeAtOpen = document.activeElement;

  if (
    activeAtOpen &&
    (activeAtOpen.tagName === "TEXTAREA" ||
      (activeAtOpen.tagName === "INPUT" &&
        ["text", "search", "email", "url", "tel", "password"].includes(
          activeAtOpen.type || "text"
        )))
  ) {
    selectionInfo = {
      type: "input",
      element: activeAtOpen,
      start: activeAtOpen.selectionStart ?? 0,
      end: activeAtOpen.selectionEnd ?? 0,
    };
  } else if (activeAtOpen && activeAtOpen.isContentEditable) {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      selectionInfo = {
        type: "contentEditable",
        element: activeAtOpen,
        range: sel.getRangeAt(0).cloneRange(),
      };
    }
  } else {
    const r = getCurrentRange();
    if (r) {
      selectionInfo = { type: "document", range: r.cloneRange() };
    }
  }

  // Visual for active mode button
  function updateActiveButtons() {
    div.querySelectorAll("button[data-mode]").forEach((b) => {
      b.classList.toggle("active", b.getAttribute("data-mode") === mode);
    });
  }

  div.querySelectorAll("button[data-mode]").forEach((b) => {
    b.addEventListener("click", async () => {
      mode = b.getAttribute("data-mode");
      updateActiveButtons();
      await runLLM();
    });
  });
  updateActiveButtons();

  div.querySelector('[data-action="close"]').onclick = removePopup;
  div.querySelector('[data-action="copy"]').onclick = () => {
    navigator.clipboard.writeText(lastOutput || "");
  };

  // 👉 Important: first remove popup (so it doesn't interfere with click/insert),
  // then in next tick restore and insert
  div.querySelector('[data-action="apply"]').onclick = () => {
    if (!lastOutput) return;
    removePopup();
    // give engine one tick to refocus after DOM removal
    setTimeout(() => {
      let ok = false;
      if (selectionInfo?.type === "input") {
        ok = insertIntoInputBySavedSelection(selectionInfo, lastOutput);
      } else if (selectionInfo?.type === "contentEditable") {
        ok = insertIntoContentEditableBySavedRange(selectionInfo, lastOutput);
      } else if (selectionInfo?.type === "document") {
        ok = insertIntoDocumentRange(selectionInfo, lastOutput);
      }
      if (!ok) {
        // fallback: put in clipboard
        navigator.clipboard.writeText(lastOutput);
      }
    }, 0);
  };

  // start immediately (polish)
  runLLM();

  async function runLLM(retryCount = 0) {
    const status = div.querySelector(".status");
    const result = div.querySelector(".result");
    const applyBtn = div.querySelector('[data-action="apply"]');
    const copyBtn = div.querySelector('[data-action="copy"]');

    if (!originalText?.trim()) {
      status.textContent = "No text to process";
      result.style.display = "none";
      applyBtn.disabled = true;
      copyBtn.disabled = true;
      return;
    }

    const isRetry = retryCount > 0;
    status.textContent = isRetry ? `Retry ${retryCount}...` : "Processing…";
    result.style.display = "none";
    applyBtn.disabled = true;
    copyBtn.disabled = true;

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
        status.textContent = "Error: " + (resp?.error || "unknown");
        return;
      }

      lastOutput = resp.output || "";
      const cacheIndicator = resp.cached ? " (cached)" : "";
      status.textContent = `${mode} (formal)${cacheIndicator}`;
      result.textContent = lastOutput;
      result.style.display = "block";
      applyBtn.disabled = !lastOutput;
      copyBtn.disabled = !lastOutput;
    } catch (e) {
      status.textContent = "Connection error: " + e.message;
    }
  }
}

// open popup on signal
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "OPEN_CORRECTOR") {
    const text =
      msg.selectionText || (window.getSelection?.().toString() ?? "");
    createPopup(text);
  }
});

// close on Esc and click outside
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
