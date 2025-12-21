import { saveUndoState } from "./helpers.js";

const closestContentEditable = (node) => {
  const el =
    node && node.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  if (!el) return null;
  // Gmail/Notion часто держат фокус на вложенных span/div
  return el.closest?.('[contenteditable="true"]') || null;
};

const isRangeProbablyUsable = (range) => {
  try {
    const sc = range?.startContainer;
    const ec = range?.endContainer;
    return !!(sc && ec && (sc.isConnected ?? true) && (ec.isConnected ?? true));
  } catch {
    return false;
  }
};

const placeCaretAtEnd = (el) => {
  try {
    const sel = window.getSelection?.();
    if (!sel) return false;
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    sel.removeAllRanges();
    sel.addRange(r);
    return true;
  } catch {
    return false;
  }
};

// Centralized event emission for text input
const emitTextInputEvents = (target, text, inputType = "insertText") => {
  if (!target || !target.isConnected) return;

  // best-effort beforeinput
  let allowed = true;
  try {
    allowed = target.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        composed: true,
        inputType,
        data: text,
      })
    );
  } catch {}
  if (!allowed) return;

  // then input
  try {
    target.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        cancelable: false,
        composed: true,
        inputType,
        data: text,
      })
    );
    return;
  } catch {}

  try {
    target.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  } catch {}
};

// Unified text application function
export const applyText = (selectionInfo, text) => {
  if (!selectionInfo || !text) return false;

  let success = false;
  let targetElement = null;
  let didManualInsert = false;

  switch (selectionInfo.type) {
    case "input": {
      const el = selectionInfo.element;
      if (!el || el.disabled || el.readOnly || !el.isConnected) break;

      el.focus({ preventScroll: true });
      const start = selectionInfo.start ?? el.selectionStart ?? 0;
      const end = selectionInfo.end ?? el.selectionEnd ?? 0;
      const value = el.value ?? "";
      const safeStart = Math.max(0, Math.min(start, value.length));
      const safeEnd = Math.max(safeStart, Math.min(end, value.length));

      // Save state for custom undo (Cmd+Z / Ctrl+Z)
      saveUndoState(el, safeStart, safeEnd);

      try {
        el.setSelectionRange(safeStart, safeEnd);
      } catch {
        // some inputs may throw; fallback will handle replacement
      }
      const beforeValue = el.value ?? "";
      const ok = document.execCommand("insertText", false, text);
      const afterValue = el.value ?? "";
      const execReallyWorked = ok && afterValue !== beforeValue;

      if (!execReallyWorked) {
        // Fallback: direct value manipulation
        const before = value.slice(0, safeStart);
        const after = value.slice(safeEnd);
        el.value = before + text + after;
        const caret = before.length + text.length;
        try {
          el.setSelectionRange(caret, caret);
        } catch {}
        emitTextInputEvents(el, text, "insertReplacementText");
        // verify the change stuck (best-effort)
        const expected = before + text + after;
        if ((el.value ?? "") !== expected) break; // keep success=false
      } else {
        // execCommand usually fires proper events; avoid duplicating input
      }

      success = true;
      targetElement = el;
      break;
    }

    case "contentEditable": {
      let el = selectionInfo.element;
      const saved = selectionInfo.range;
      if ((!el || !el.isConnected) && document.activeElement) {
        el = closestContentEditable(document.activeElement);
      }
      if (!el || !el.isConnected || !saved) break;

      el.focus({ preventScroll: true });
      const sel = window.getSelection?.();
      if (!sel) break;

      // Try to restore the saved range; if it became invalid due to re-render, fallback.
      let range = null;
      try {
        range = saved.cloneRange();
      } catch {
        range = null;
      }

      sel.removeAllRanges();
      if (range && isRangeProbablyUsable(range)) {
        try {
          sel.addRange(range);
        } catch {
          // fallback below
        }
      } else {
        // Range likely detached; put caret in the CE as a safe fallback
        placeCaretAtEnd(el);
        // Re-read the current range (caret) for manual fallback path
        if (sel.rangeCount) range = sel.getRangeAt(0);
      }

      // Try native method first
      const ok = document.execCommand("insertText", false, text);
      if (ok) {
        success = true;
        targetElement = el;
        // native path: do not synthesize events (usually already fired)
        // optionally keep a flag if you want to differentiate
        break;
      }

      // Fallback: manual replacement
      if (!range) break;
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
      // mark that we used manual insertion
      didManualInsert = true;
      break;
    }

    case "document": {
      const saved = selectionInfo.range;
      if (!saved) break;

      const sel = window.getSelection?.();
      if (!sel) break;
      sel.removeAllRanges();
      const range = saved.cloneRange();
      sel.addRange(range);
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
      targetElement =
        (range.commonAncestorContainer?.nodeType === Node.ELEMENT_NODE
          ? range.commonAncestorContainer
          : range.commonAncestorContainer?.parentElement) ||
        document.activeElement ||
        document.body;
      if (targetElement && targetElement.nodeType !== Node.ELEMENT_NODE) {
        targetElement = document.activeElement || document.body;
      }
      break;
    }
  }

  // Emit events if insertion was successful
  if (
    success &&
    selectionInfo.type === "contentEditable" &&
    targetElement &&
    didManualInsert
  ) {
    emitTextInputEvents(targetElement, text);
  }
  // For "document": skip (or do a simple Event("input") on document)

  // Fallback: put in clipboard if insertion failed
  if (!success) {
    // clipboard может быть недоступен без user gesture/permissions — best-effort
    try {
      void navigator.clipboard?.writeText?.(text);
    } catch {}
  }

  return success;
};

// Legacy functions for backward compatibility
export const insertIntoInputBySavedSelection = (info, text) =>
  applyText(
    {
      type: "input",
      element: info?.element,
      start: info?.start,
      end: info?.end,
    },
    text
  );

export const insertIntoContentEditableBySavedRange = (info, text) =>
  applyText(
    {
      type: "contentEditable",
      element: info?.element,
      range: info?.range,
    },
    text
  );

export const insertIntoDocumentRange = (info, text) =>
  applyText(
    {
      type: "document",
      range: info?.range,
    },
    text
  );

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
  } else {
    // Prefer nearest contenteditable ancestor (Gmail/Notion)
    const ce =
      closestContentEditable(activeAtOpen) ||
      closestContentEditable(window.getSelection?.()?.anchorNode);
    if (ce) {
      const sel = window.getSelection?.();
      if (!sel || sel.rangeCount === 0) return null;
      const range = sel.getRangeAt(0);
      const frozen = range.cloneRange();
      return {
        type: "contentEditable",
        element: ce,
        range: frozen,
      };
    }

    const sel = window.getSelection?.();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    const frozen = range.cloneRange();
    return { type: "document", range: frozen };
  }

  return null;
};
