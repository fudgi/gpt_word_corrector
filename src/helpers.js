// Helper functions
export const getCurrentRange = () => {
  const sel = window.getSelection?.();
  if (!sel || sel.rangeCount === 0) return null;
  return sel.getRangeAt(0);
};

export const sendBg = (message, attempts = 2) => {
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

// Custom undo stack for text inputs (browser's execCommand doesn't work on textarea in Chrome)
const undoStack = new WeakMap();

export const saveUndoState = (el, start, end) => {
  const state = {
    value: el.value,
    selectionStart: start,
    selectionEnd: end,
  };
  undoStack.set(el, state);
};

const handleUndo = (e) => {
  const el = e.target;
  if (
    !(el instanceof HTMLTextAreaElement) &&
    !(el instanceof HTMLInputElement)
  ) {
    return;
  }

  const state = undoStack.get(el);
  if (!state) return;

  // Check for Ctrl+Z or Cmd+Z
  if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
    e.preventDefault();
    e.stopPropagation();
    el.value = state.value;
    el.setSelectionRange(state.selectionStart, state.selectionEnd);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    undoStack.delete(el);
  }
};

// Attach global undo handler once
let undoHandlerAttached = false;
export const initUndoHandler = () => {
  if (undoHandlerAttached) return;
  if (typeof document !== "undefined") {
    document.addEventListener("keydown", handleUndo, true);
    undoHandlerAttached = true;
  }
};
