import { sendBg } from './helpers.js';
import { getSelectionInfo, applyCorrectedText } from './textInsertion.js';
import { removePopup, getLastContextMouse } from './ui.js';
import { modeText, successMessageOptions } from './constants.js';

// Main popup creation and management
export const createPopup = (initialText) => {
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

  const lastContextMouse = getLastContextMouse();
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
