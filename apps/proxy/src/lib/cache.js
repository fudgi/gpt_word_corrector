import crypto from "node:crypto";
import { CACHE_TTL } from "../config.js";

const cache = new Map();

function makeCacheKey({ mode, style, text }) {
  const hash = crypto.createHash("sha256").update(text).digest("hex");

  return `${mode}:${style}:${hash}`;
}

function getCacheEntry(cacheKey) {
  return cache.get(cacheKey);
}

function setCacheEntry(cacheKey, output) {
  cache.set(cacheKey, { output, timestamp: Date.now() });
  if (cache.size > 1000) {
    const now = Date.now();
    for (const [key, value] of cache.entries()) {
      if (now - value.timestamp > CACHE_TTL) {
        cache.delete(key);
      }
    }
  }
}

export { CACHE_TTL, makeCacheKey, getCacheEntry, setCacheEntry };
