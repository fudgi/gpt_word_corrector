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
  // Remove existing notification
  document.getElementById("corrector-notification")?.remove();

  // Create Shadow DOM container for notification
  const notificationHost = document.createElement("div");
  notificationHost.id = "corrector-notification";
  notificationHost.classList.add(type);

  // Create Shadow Root
  const shadowRoot = notificationHost.attachShadow({ mode: "open" });

  // Load and add styles to Shadow DOM
  const notificationStyles = await loadCSS("src/notification.css");
  const style = document.createElement("style");
  style.textContent = notificationStyles;
  shadowRoot.appendChild(style);

  // Create notification content
  const notificationContent = document.createElement("div");
  notificationContent.textContent = message;
  shadowRoot.appendChild(notificationContent);

  // Position notification near cursor or center of screen
  const x = lastContextMouse.x + window.scrollX + 8;
  const y = lastContextMouse.y + window.scrollY + 8;

  Object.assign(notificationHost.style, {
    left: `${x}px`,
    top: `${y}px`,
  });

  document.body.appendChild(notificationHost);

  // Auto remove after duration
  if (duration > 0) {
    setTimeout(() => {
      notificationHost.classList.add("fade-out");
      setTimeout(() => {
        notificationHost.remove();
      }, 300);
    }, duration);
  }
};

// Show loading indicator
export const showLoadingIndicator = async (message = "Processing...") => {
  await showNotification(message, "loading", 0); // 0 duration means no auto-remove
};
