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

  const isE2E = Boolean(window.__PW_E2E__);
  const ttl = isE2E ? 8000 : duration;

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
export const showLoadingIndicator = async (message = "Processing...") => {
  await showNotification(message, "loading", 0); // 0 duration means no auto-remove
};
