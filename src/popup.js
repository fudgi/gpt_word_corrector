import { sendBg } from "./helpers.js";
import { getSelectionInfo, applyCorrectedText } from "./textInsertion.js";
import { removePopup, getLastContextMouse, showNotification } from "./ui.js";
import { modeText, successMessageOptions } from "./constants.js";

// Load CSS styles for Shadow DOM
const loadCSS = async (cssPath) => {
  try {
    const response = await fetch(chrome.runtime.getURL(cssPath));
    return await response.text();
  } catch (error) {
    console.warn(`Failed to load CSS from ${cssPath}:`, error);
    return "";
  }
};

// Main popup creation and management
export const createPopup = async (initialText) => {
  removePopup();

  // Create Shadow DOM container
  const shadowHost = document.createElement("div");
  shadowHost.id = "corrector-popup";

  // Create Shadow Root
  const shadowRoot = shadowHost.attachShadow({ mode: "open" });

  // Load and add styles to Shadow DOM
  const popupStyles = await loadCSS("src/popup.css");
  const styleElement = document.createElement("style");
  styleElement.textContent = popupStyles;
  shadowRoot.appendChild(styleElement);

  // Create popup content
  const popupContent = document.createElement("div");
  popupContent.innerHTML = `
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

  shadowRoot.appendChild(popupContent);

  const lastContextMouse = getLastContextMouse();
  Object.assign(shadowHost.style, {
    position: "absolute",
    left: `${lastContextMouse.x + window.scrollX + 8}px`,
    top: `${lastContextMouse.y + window.scrollY + 8}px`,
    zIndex: 2147483647,
  });
  shadowHost.addEventListener("mousedown", (e) => e.preventDefault());
  document.body.appendChild(shadowHost);

  let mode = "polish";
  let style = "formal";
  let originalText = initialText || (window.getSelection?.().toString() ?? "");
  let lastOutput = "";

  // 📌 Save original insertion location
  const selectionInfo = getSelectionInfo();

  // Visual for active mode button
  const updateActiveButtons = () => {
    shadowRoot.querySelectorAll("button[data-mode]").forEach((b) => {
      b.classList.toggle("active", b.getAttribute("data-mode") === mode);
    });
  };

  shadowRoot.querySelectorAll("button[data-mode]").forEach((b) => {
    b.addEventListener("click", async () => {
      mode = b.getAttribute("data-mode");
      updateActiveButtons();
      await runLLM();
    });
  });
  updateActiveButtons();

  // 👉 Important: first remove popup (so it doesn't interfere with click/insert),
  // then in next tick restore and insert
  shadowRoot.querySelector('[data-action="apply"]').onclick = () => {
    if (!lastOutput) return;
    removePopup();
    // give engine one tick to refocus after DOM removal
    setTimeout(() => {
      applyCorrectedText(selectionInfo, lastOutput);
      // show success notification after text is applied
      showNotification(
        successMessageOptions[mode] ?? "✅ Applied",
        "success"
      ).catch(() => {
        // ignore errors
      });
    }, 0);
  };

  const runLLM = async () => {
    const status = shadowRoot.querySelector(".status");
    const result = shadowRoot.querySelector(".result");
    const applyBtn = shadowRoot.querySelector('[data-action="apply"]');

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
