import express from "express";
import rateLimit from "express-rate-limit";
import fetch from "node-fetch";
import dotenv from "dotenv";
import crypto from "node:crypto";
import {
  ERROR_DEFINITIONS,
  MAX_TEXT_LENGTH,
  VALID_MODES,
  proxyError,
} from "../../packages/shared-contract/index.js";

dotenv.config(); // Load .env file

const app = express();
app.use(express.json());

function sendProxyError(res, code, message, status, retryAfterMs = 0) {
  return res
    .status(status)
    .json(proxyError(code, message, retryAfterMs));
}

function getErrorDefinition(code) {
  return ERROR_DEFINITIONS[code] || ERROR_DEFINITIONS.INTERNAL;
}

function getRetryAfterMs(headerValue) {
  if (!headerValue) return 0;
  const seconds = Number(headerValue);
  if (Number.isNaN(seconds)) {
    return 0;
  }
  return Math.max(0, seconds * 1000);
}

function sendDefinedError(res, code, messageOverride, retryAfterMs = 0) {
  const normalizedCode = ERROR_DEFINITIONS[code] ? code : "INTERNAL";
  const definition = getErrorDefinition(normalizedCode);
  return sendProxyError(
    res,
    normalizedCode,
    messageOverride || definition.message,
    definition.status,
    retryAfterMs
  );
}

app.use(
  rateLimit({
    windowMs: 60_000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      const retryAfterMs = req.rateLimit?.resetTime
        ? Math.max(req.rateLimit.resetTime.getTime() - Date.now(), 0)
        : 0;
      if (retryAfterMs > 0) {
        res.set("Retry-After", Math.ceil(retryAfterMs / 1000));
      }
      return sendDefinedError(res, "RATE_LIMITED", undefined, retryAfterMs);
    },
  })
);

// Simple in-memory cache
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Request deduplication
const pendingRequests = new Map();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error("❌ No OPENAI_API_KEY found. Add it to .env");
  process.exit(1);
}

const installTokens = new Map();
const TOKEN_RATE_WINDOW_MS = 60_000;
const TOKEN_RATE_MAX = 60;

function isValidUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
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

function getBearerToken(req) {
  const authHeader = req.get("Authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

app.post("/v1/register", (req, res) => {
  const { install_id: installId, version } = req.body || {};

  if (!installId || typeof installId !== "string" || !isValidUuid(installId)) {
    return sendDefinedError(res, "INVALID_REQUEST", "Invalid install_id");
  }

  if (version !== undefined && typeof version !== "string") {
    return sendDefinedError(res, "INVALID_REQUEST", "Invalid version");
  }

  const token = issueInstallToken(installId);
  return res.json({ install_token: token });
});

app.post("/v1/transform", async (req, res) => {
  const bearerToken = getBearerToken(req);
  if (!bearerToken) {
    return sendDefinedError(res, "UNAUTHORIZED");
  }

  const tokenRecord = getTokenRecord(bearerToken);
  if (!tokenRecord) {
    return sendDefinedError(res, "UNAUTHORIZED");
  }

  if (tokenRecord.banned) {
    return sendDefinedError(res, "BANNED");
  }

  const rateLimit = checkTokenRateLimit(tokenRecord);
  if (rateLimit.limited) {
    if (rateLimit.retryAfterMs > 0) {
      res.set("Retry-After", Math.ceil(rateLimit.retryAfterMs / 1000));
    }
    return sendDefinedError(
      res,
      "RATE_LIMITED",
      undefined,
      rateLimit.retryAfterMs
    );
  }

  tokenRecord.lastSeen = Date.now();

  const {
    mode = "polish",
    text = "",
    style = "neutral",
    test_error,
  } = req.body || {};

  if (process.env.CORRECTOR_TEST === "1") {
    const forcedError =
      req.get("X-Test-Error") || (typeof test_error === "string" && test_error);
    if (forcedError) {
      return sendDefinedError(res, forcedError);
    }
  }

  // Input validation
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return sendDefinedError(res, "INVALID_REQUEST", "Text is required");
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return sendDefinedError(
      res,
      "INVALID_REQUEST",
      `Text too long (max ${MAX_TEXT_LENGTH} chars)`
    );
  }

  if (!VALID_MODES.includes(mode)) {
    return sendDefinedError(res, "INVALID_REQUEST", "Invalid mode");
  }

  // Check cache
  const cacheKey = `${mode}:${style}:${text}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`Cache hit for mode: ${mode}, text length: ${text.length}`);
    return res.json({ output: cached.output, cached: true });
  }

  // Check deduplication
  if (pendingRequests.has(cacheKey)) {
    const pendingResolvers = pendingRequests.get(cacheKey);
    return new Promise((resolve) => {
      pendingResolvers.push((result) => {
        if (!result.ok) {
          res.status(result.status).json({ error: result.error });
        } else {
          res.json(result.data);
        }
        resolve();
      });
    });
  }

  // Create new request
  const requestPromise = new Promise(async (resolve) => {
    const resolvers = [resolve];
    pendingRequests.set(cacheKey, resolvers);

    try {
      const startTime = Date.now();
      console.log(
        `Processing request: mode=${mode}, text length=${text.length}`
      );

      // Simplified prompts for 2 modes
      const prompts = {
        polish: "Improve grammar and tone. Keep meaning.",
        to_en: "Translate to natural English. Fix grammar.",
      };

      const system = `You are a writing assistant. ${prompts[mode]} Return only the result, no explanations.`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15_000);
      let r;
      try {
        r = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: system },
              { role: "user", content: text },
            ],
            max_tokens: 500,
            temperature: 0.3,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!r.ok) {
        const errorText = await r.text();
        console.error(`OpenAI API error: ${r.status} - ${errorText}`);
        let mapped;
        let retryAfterMs = 0;
        switch (r.status) {
          case 400:
            mapped = {
              code: "INVALID_REQUEST",
              message: "Invalid request",
            };
            break;
          case 401:
            mapped = { code: "UPSTREAM_UNAVAILABLE", message: "Upstream down" };
            break;
          case 402:
            mapped = {
              code: "PAYMENT_REQUIRED",
              message: "Payment required",
            };
            break;
          case 408:
          case 504:
            mapped = {
              code: "UPSTREAM_UNAVAILABLE",
              message: "Upstream timeout",
            };
            break;
          case 429:
            mapped = { code: "RATE_LIMITED", message: "Too many requests" };
            retryAfterMs = getRetryAfterMs(r.headers.get("retry-after"));
            break;
          default:
            mapped = {
              code: "UPSTREAM_UNAVAILABLE",
              message: "Upstream service error",
            };
            break;
        }
        const definition = getErrorDefinition(mapped.code);
        const error = {
          ok: false,
          error: proxyError(
            mapped.code,
            mapped.message,
            retryAfterMs
          ).error,
          status: definition.status,
        };
        resolvers.forEach((resolve) => resolve(error));
        return;
      }

      const data = await r.json();
      const output = data.choices?.[0]?.message?.content?.trim() || "";

      // Save to cache
      if (output) {
        cache.set(cacheKey, { output, timestamp: Date.now() });
        // Clean old cache entries
        if (cache.size > 1000) {
          const now = Date.now();
          for (const [key, value] of cache.entries()) {
            if (now - value.timestamp > CACHE_TTL) {
              cache.delete(key);
            }
          }
        }
      }

      const processingTime = Date.now() - startTime;
      console.log(`Request completed in ${processingTime}ms`);

      const result = { ok: true, data: { output } };
      resolvers.forEach((resolve) => resolve(result));
    } catch (e) {
      const isTimeout = e?.name === "AbortError";
      const code = "UPSTREAM_UNAVAILABLE";
      const definition = getErrorDefinition(code);
      const error = {
        ok: false,
        error: proxyError(
          code,
          isTimeout ? "Upstream timeout" : definition.message
        ).error,
        status: definition.status,
      };
      resolvers.forEach((resolve) => resolve(error));
    } finally {
      pendingRequests.delete(cacheKey);
    }
  });

  return requestPromise.then((result) => {
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    return res.json(result.data);
  });
});

app.use((err, _req, res, _next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return sendDefinedError(res, "INVALID_REQUEST", "Invalid JSON");
  }
  return sendDefinedError(res, "INTERNAL");
});

const PORT = 8787;

app
  .listen(PORT, () => {
    console.log(`Proxy on http://localhost:${PORT}`);
  })
  .on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `❌ Port ${PORT} is already in use. Please stop the other process or use a different port.`
      );
      console.error(
        `   To find the process using port ${PORT}, run: lsof -ti:${PORT}`
      );
    } else {
      console.error("❌ Server error:", err);
    }
    process.exit(1);
  });
