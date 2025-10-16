import { getCurrentRange } from "./helpers.js";

// Centralized event emission for text input
const emitTextInputEvents = (target, text) => {
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

// Unified text application function
export const applyText = (selectionInfo, text) => {
  if (!selectionInfo || !text) return false;

  let success = false;
  let targetElement = null;

  switch (selectionInfo.type) {
    case "input": {
      const el = selectionInfo.element;
      if (!el || el.disabled || el.readOnly) break;

      el.focus({ preventScroll: true });
      const start = selectionInfo.start ?? el.selectionStart ?? 0;
      const end = selectionInfo.end ?? el.selectionEnd ?? 0;
      const before = el.value.slice(0, start);
      const after = el.value.slice(end);
      el.value = before + text + after;
      const caret = before.length + text.length;
      el.setSelectionRange(caret, caret);

      success = true;
      targetElement = el;
      break;
    }

    case "contentEditable": {
      const el = selectionInfo.element;
      const saved = selectionInfo.range;
      if (!el || !el.isContentEditable || !saved) break;

      el.focus({ preventScroll: true });
      const sel = window.getSelection();
      sel.removeAllRanges();
      const range = saved.cloneRange();
      sel.addRange(range);

      // Try native method first
      const ok = document.execCommand("insertText", false, text);
      if (ok) {
        success = true;
        targetElement = el;
        break;
      }

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

      success = true;
      targetElement = el;
      break;
    }

    case "document": {
      const saved = selectionInfo.range;
      if (!saved) break;

      const sel = window.getSelection();
      sel.removeAllRanges();
      const range = saved.cloneRange();
      sel.addRange(range);
      range.deleteContents();
      range.insertNode(document.createTextNode(text));

      success = true;
      targetElement = document.activeElement || document.body;
      break;
    }
  }

  // Emit events if insertion was successful
  if (success && targetElement) {
    emitTextInputEvents(targetElement, text);
  }

  // Fallback: put in clipboard if insertion failed
  if (!success) {
    navigator.clipboard.writeText(text);
  }

  return success;
};

// Legacy functions for backward compatibility
export const insertIntoInputBySavedSelection = (info, text) => {
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

export const insertIntoContentEditableBySavedRange = (info, text) => {
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

export const insertIntoDocumentRange = (info, text) => {
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

export const getSelectionInfo = () => {
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

export const applyCorrectedText = (selectionInfo, correctedText) => {
  return applyText(selectionInfo, correctedText);
};
