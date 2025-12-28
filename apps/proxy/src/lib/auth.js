import crypto from "node:crypto";
import { TOKEN_RATE_MAX, TOKEN_RATE_WINDOW_MS } from "../config.js";

const installTokens = new Map();

function getBearerToken(req) {
  const authHeader = req.get("Authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function issueInstallToken(installId) {
  const token = `tok_${crypto.randomBytes(24).toString("hex")}`;
  installTokens.set(token, {
    installId,
    createdAt: Date.now(),
    lastSeen: Date.now(),
    banned: false,
    rateLimit: {
      remaining: TOKEN_RATE_MAX,
      resetAt: Date.now() + TOKEN_RATE_WINDOW_MS,
    },
  });
  return token;
}

function getTokenRecord(token) {
  return installTokens.get(token);
}

function checkTokenRateLimit(record) {
  const now = Date.now();
  if (now > record.rateLimit.resetAt) {
    record.rateLimit.resetAt = now + TOKEN_RATE_WINDOW_MS;
    record.rateLimit.remaining = TOKEN_RATE_MAX;
  }
  if (record.rateLimit.remaining <= 0) {
    return {
      limited: true,
      retryAfterMs: record.rateLimit.resetAt - now,
    };
  }
  record.rateLimit.remaining -= 1;
  return { limited: false, retryAfterMs: 0 };
}

export {
  getBearerToken,
  issueInstallToken,
  getTokenRecord,
  checkTokenRateLimit,
};
