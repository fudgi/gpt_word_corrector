import { dispatchTextInputEvents, getCurrentRange } from './helpers.js';

// Insert into input/textarea by saved coordinates
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

// Insert into contentEditable by saved Range
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

// Insert into arbitrary document Range
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
