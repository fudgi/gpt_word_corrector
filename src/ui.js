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
export const showNotification = (message, type = "info", duration = 3000) => {
  // Remove existing notification
  document.getElementById("corrector-notification")?.remove();

  const notification = document.createElement("div");
  notification.id = "corrector-notification";
  notification.textContent = message;
  notification.classList.add(type);

  // Position notification near cursor or center of screen
  const x = lastContextMouse.x + window.scrollX + 8;
  const y = lastContextMouse.y + window.scrollY + 8;

  Object.assign(notification.style, {
    left: `${x}px`,
    top: `${y}px`,
  });

  document.body.appendChild(notification);

  // Auto remove after duration
  setTimeout(() => {
    notification.remove();
  }, duration);
};

// Show loading indicator
export const showLoadingIndicator = (message = "Processing...") => {
  showNotification(message, "loading", 0); // 0 duration means no auto-remove
};
