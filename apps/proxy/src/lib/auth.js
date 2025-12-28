import crypto from "node:crypto";
import { TOKEN_RATE_MAX, TOKEN_RATE_WINDOW_MS } from "../config.js";

function getBearerToken(req) {
  const authHeader = req.get("Authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function createAuth({ db }) {
  const tokenRateLimits = new Map();

  function hashToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  function issueInstallToken(installId) {
    const token = `tok_${crypto.randomBytes(24).toString("hex")}`;
    const now = Date.now();
    const tokenHash = hashToken(token);
    db.upsertInstallationToken(installId, tokenHash, now);
    return token;
  }

  function getTokenRecordByBearer(bearerToken) {
    if (!bearerToken) return null;
    const tokenHash = hashToken(bearerToken);
    const record = db.findInstallationByTokenHash(tokenHash);
    if (!record) return null;
    return { ...record, tokenHash };
  }

  function checkTokenRateLimit(tokenHash) {
    const now = Date.now();
    let rateLimit = tokenRateLimits.get(tokenHash);
    if (!rateLimit) {
      rateLimit = {
        remaining: TOKEN_RATE_MAX,
        resetAt: now + TOKEN_RATE_WINDOW_MS,
      };
      tokenRateLimits.set(tokenHash, rateLimit);
    }
    if (now > rateLimit.resetAt) {
      rateLimit.resetAt = now + TOKEN_RATE_WINDOW_MS;
      rateLimit.remaining = TOKEN_RATE_MAX;
    }
    if (rateLimit.remaining <= 0) {
      return {
        limited: true,
        retryAfterMs: rateLimit.resetAt - now,
      };
    }
    rateLimit.remaining -= 1;
    return { limited: false, retryAfterMs: 0 };
  }

  function touch(installId) {
    db.touchInstallation(installId, Date.now());
  }

  return {
    getBearerToken,
    issueInstallToken,
    getTokenRecordByBearer,
    checkTokenRateLimit,
    touch,
  };
}

export {
  getBearerToken,
  createAuth,
};
