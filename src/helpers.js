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

export const dispatchTextInputEvents = (target, text) => {
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
