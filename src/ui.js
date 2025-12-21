import { isE2EEnabled } from "./e2eInfra.js";

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

// UI and notification functions
let lastContextMouse = { x: 0, y: 0 };

export const setLastContextMouse = (x, y) => {
  lastContextMouse = { x, y };
};

export const getLastContextMouse = () => lastContextMouse;

export const removePopup = () => {
  document.getElementById("corrector-popup")?.remove();
};

// Show notification to user
export const showNotification = async (
  message,
  type = "info",
  duration = 3000
) => {
  // Clean up previous notification and its timers
  const prev = document.getElementById("corrector-notification");
  if (prev) {
    clearTimeout(prev.__fadeTimer);
    clearTimeout(prev.__removeTimer);
    prev.remove();
  }

  const ttl = isE2EEnabled() ? 8000 : duration;

  const notificationHost = document.createElement("div");
  notificationHost.id = "corrector-notification";
  notificationHost.setAttribute("data-testid", "corrector-notification");
  notificationHost.classList.add(type);

  const shadowRoot = notificationHost.attachShadow({ mode: "open" });

  // Put content immediately (so tests can see it right away)
  const notificationContent = document.createElement("div");
  notificationContent.textContent = message;
  shadowRoot.appendChild(notificationContent);

  // Position early
  const x = lastContextMouse.x + window.scrollX + 8;
  const y = lastContextMouse.y + window.scrollY + 8;
  Object.assign(notificationHost.style, { left: `${x}px`, top: `${y}px` });

  // Append to DOM BEFORE async CSS load
  document.body.appendChild(notificationHost);

  // Load styles (async, best-effort)
  try {
    const notificationStyles = await loadCSS("src/notification.css");
    if (notificationStyles) {
      const style = document.createElement("style");
      style.textContent = notificationStyles;
      shadowRoot.prepend(style);
    }
  } catch {
    // ignore
  }

  if (ttl > 0) {
    notificationHost.__fadeTimer = setTimeout(() => {
      notificationHost.classList.add("fade-out");
      notificationHost.__removeTimer = setTimeout(() => {
        notificationHost.remove();
      }, 300);
    }, ttl);
  }
};

// Show loading indicator
const LOADING_ID = "corrector-loading";

export const showLoadingIndicator = (message = "Processing...") => {
  // Clean up previous loading indicator
  const prev = document.getElementById(LOADING_ID);
  if (prev) {
    clearTimeout(prev.__fadeTimer);
    clearTimeout(prev.__removeTimer);
    prev.remove();
  }

  const ttl = 0; // No auto-remove for loading indicator

  const notificationHost = document.createElement("div");
  notificationHost.id = LOADING_ID;
  notificationHost.setAttribute("data-testid", "corrector-loading");
  notificationHost.classList.add("loading");

  const shadowRoot = notificationHost.attachShadow({ mode: "open" });

  // Put content immediately
  const notificationContent = document.createElement("div");
  notificationContent.textContent = message;
  shadowRoot.appendChild(notificationContent);

  // Position early
  const x = lastContextMouse.x + window.scrollX + 8;
  const y = lastContextMouse.y + window.scrollY + 8;
  Object.assign(notificationHost.style, { left: `${x}px`, top: `${y}px` });

  // Append to DOM BEFORE async CSS load
  document.body.appendChild(notificationHost);

  // Load styles (async, best-effort)
  void (async () => {
    try {
      const notificationStyles = await loadCSS("src/notification.css");
      if (notificationStyles) {
        const style = document.createElement("style");
        style.textContent = notificationStyles;
        shadowRoot.prepend(style);
      }
    } catch {
      // ignore
    }
  })();
};

// Hide loading indicator
export const hideLoadingIndicator = () => {
  const loading = document.getElementById(LOADING_ID);
  if (loading) {
    clearTimeout(loading.__fadeTimer);
    clearTimeout(loading.__removeTimer);
    loading.remove();
  }
};
