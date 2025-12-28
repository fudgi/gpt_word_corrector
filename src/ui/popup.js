import { sendBg } from "../utils/helpers.js";
import { getSelectionInfo, applyText } from "../text/textInsertion.js";
import { removePopup, getLastContextMouse, showNotification } from "./ui.js";
import { modeText, successMessageOptions } from "../constants.js";

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

const clampToViewport = (host, desiredLeft, desiredTop) => {
  const padding = 8;
  const rect = host.getBoundingClientRect();
  const minLeft = window.scrollX + padding;
  const minTop = window.scrollY + padding;
  const maxLeft = window.scrollX + window.innerWidth - rect.width - padding;
  const maxTop = window.scrollY + window.innerHeight - rect.height - padding;

  const left = Math.min(Math.max(desiredLeft, minLeft), maxLeft);
  const top = Math.min(Math.max(desiredTop, minTop), maxTop);

  Object.assign(host.style, {
    left: `${left}px`,
    top: `${top}px`,
  });
};

// Main popup creation and management
export const createPopup = async (initialText) => {
  removePopup();

  // Create Shadow DOM container
  const shadowHost = document.createElement("div");
  shadowHost.id = "corrector-popup";
  shadowHost.setAttribute("data-testid", "corrector-popup");
  shadowHost.classList.add("apple", "corrector-popup");

  // Create Shadow Root
  const shadowRoot = shadowHost.attachShadow({ mode: "open" });

  // Load and add styles to Shadow DOM
  const popupStyles = await loadCSS("src/ui/apple.css");
  const styleElement = document.createElement("style");
  styleElement.textContent = popupStyles;
  shadowRoot.appendChild(styleElement);

  // Create popup content
  const popupContent = document.createElement("div");
  popupContent.className = "popup";
  popupContent.innerHTML = `
    <div class="header">
      <div class="title">Corrector</div>
      <div class="subtitle" data-testid="corrector-subtitle"></div>
    </div>
    <div class="row modes">
      <button data-mode="polish" title="Improve grammar and style">Polish</button>
      <button data-mode="to_en" title="Translate to English">To English</button>
    </div>
    <div class="status" data-testid="corrector-status"></div>
    <div class="result" data-testid="corrector-result" hidden></div>
    <div class="actions">
      <button data-action="apply" class="primary" disabled>Apply</button>
    </div>
  `;

  shadowRoot.appendChild(popupContent);

  const lastContextMouse = getLastContextMouse();
  const desiredLeft = lastContextMouse.x + window.scrollX + 8;
  const desiredTop = lastContextMouse.y + window.scrollY + 8;
  Object.assign(shadowHost.style, {
    position: "absolute",
    left: `${desiredLeft}px`,
    top: `${desiredTop}px`,
    zIndex: 2147483647,
  });
  shadowHost.addEventListener("mousedown", (e) => e.preventDefault());
  document.body.appendChild(shadowHost);

  clampToViewport(shadowHost, desiredLeft, desiredTop);
  requestAnimationFrame(() => shadowHost.classList.add("ready"));

  const subtitle = shadowRoot.querySelector(".subtitle");
  subtitle.textContent = initialText
    ? `${initialText.slice(0, 80)}${initialText.length > 80 ? "…" : ""}`
    : "(empty)";

  let mode = "polish";
  let style = "formal";
  let originalText = initialText || (window.getSelection?.().toString() ?? "");
  let lastOutput = "";
  let runId = 0;

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
      applyText(selectionInfo, lastOutput);
      // show success notification after text is applied
      showNotification(
        successMessageOptions[mode] ?? "✅ Applied",
        "success"
      ).catch(() => {
        // ignore errors
      });
    }, 0);
  };

  shadowRoot.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const applyBtn = shadowRoot.querySelector('[data-action="apply"]');
    if (!applyBtn || applyBtn.disabled) return;
    applyBtn.click();
  });

  const runLLM = async () => {
    const myRun = ++runId;
    const status = shadowRoot.querySelector(".status");
    const result = shadowRoot.querySelector(".result");
    const applyBtn = shadowRoot.querySelector('[data-action="apply"]');

    if (!originalText?.trim()) {
      status.textContent = "No text to process";
      result.hidden = true;
      applyBtn.disabled = true;
      return;
    }

    status.textContent = modeText[mode];
    result.hidden = true;
    applyBtn.disabled = true;

    try {
      const resp = await sendBg({
        type: "RUN_GPT",
        mode,
        text: originalText,
        style,
      });
      if (myRun !== runId) return; // superseded

      if (!resp?.ok) {
        const message = resp?.error?.message || resp?.error || "unknown";
        status.textContent = `❌ Error: ${message}`;
        return;
      }

      lastOutput = resp.output || "";
      const cacheIndicator = resp.cached ? " (cached)" : "";
      status.textContent = `${successMessageOptions[mode]}${cacheIndicator}`;
      result.textContent = lastOutput;
      result.hidden = false;
      applyBtn.disabled = !lastOutput;
    } catch (e) {
      status.textContent = `❌ Connection error: ${e.message}`;
    }
  };

  runLLM();
};
