// Main content script entry point
import { setupEventListeners } from "./eventListeners.js";

// Prevent duplicate injection
if (window.__corrector_bound) {
  console.debug("[Corrector] already bound, skipping duplicate injection");
}
window.__corrector_bound = true;

console.log("🔨 Content script loaded");

// Initialize the content script
setupEventListeners();
