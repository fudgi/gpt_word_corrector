// Main content script entry point
import { setupEventListeners } from "./eventListeners.js";
import { initUndoHandler } from "./helpers.js";

// Prevent duplicate injection
if (window.__corrector_bound) {
  console.debug("[Corrector] already bound, skipping duplicate injection");
} else {
  window.__corrector_bound = true;
  console.log("🔨 Content script loaded");
  initUndoHandler();
  setupEventListeners();
}
