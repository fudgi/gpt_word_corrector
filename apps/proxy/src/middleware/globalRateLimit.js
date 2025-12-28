import rateLimit, { ipKeyGenerator } from "express-rate-limit";

function createGlobalRateLimit({ auth, errors }) {
  function rateLimitKey(req) {
    const token = auth.getBearerToken(req);
    if (token) return `tok:${token}`;
    return `ip:${ipKeyGenerator(req)}`;
  }

  return rateLimit({
    windowMs: 60_000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: rateLimitKey,
    handler: (req, res) => {
      const retryAfterMs = req.rateLimit?.resetTime
        ? Math.max(req.rateLimit.resetTime.getTime() - Date.now(), 0)
        : 0;
      if (retryAfterMs > 0) {
        res.set("Retry-After", Math.ceil(retryAfterMs / 1000));
      }
      return errors.sendDefinedError(res, "RATE_LIMITED", undefined, retryAfterMs);
    },
  });
}

export { createGlobalRateLimit };
