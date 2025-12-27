import express from "express";
import rateLimit from "express-rate-limit";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config(); // Load .env file

const app = express();
app.use(express.json());

const ERROR_DEFINITIONS = {
  RATE_LIMITED: {
    status: 429,
    retryable: true,
    message: "Too many requests",
  },
  TIMEOUT: {
    status: 504,
    retryable: true,
    message: "Request timed out",
  },
  UPSTREAM_ERROR: {
    status: 502,
    retryable: true,
    message: "Upstream service error",
  },
  INVALID_INPUT: {
    status: 400,
    retryable: false,
    message: "Invalid input",
  },
  UNAUTHORIZED: {
    status: 401,
    retryable: false,
    message: "Unauthorized",
  },
  PAYMENT_REQUIRED: {
    status: 402,
    retryable: false,
    message: "Payment required",
  },
  INTERNAL_ERROR: {
    status: 500,
    retryable: false,
    message: "Internal error",
  },
};

function proxyError(code, message, status, retryable) {
  return {
    error: {
      code,
      message,
      retryable,
    },
  };
}

function sendProxyError(res, code, message, status, retryable) {
  return res.status(status).json(proxyError(code, message, status, retryable));
}

function getErrorDefinition(code) {
  return ERROR_DEFINITIONS[code] || ERROR_DEFINITIONS.INTERNAL_ERROR;
}

function sendDefinedError(res, code, messageOverride) {
  const normalizedCode = ERROR_DEFINITIONS[code] ? code : "INTERNAL_ERROR";
  const definition = getErrorDefinition(normalizedCode);
  return sendProxyError(
    res,
    normalizedCode,
    messageOverride || definition.message,
    definition.status,
    definition.retryable
  );
}

app.use(
  rateLimit({
    windowMs: 60_000,
    max: 60,
    handler: (_req, res) => sendDefinedError(res, "RATE_LIMITED"),
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

app.post("/v1/transform", async (req, res) => {
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
    return sendDefinedError(res, "INVALID_INPUT", "Text is required");
  }

  if (text.length > 2000) {
    return sendDefinedError(
      res,
      "INVALID_INPUT",
      "Text too long (max 2000 chars)"
    );
  }

  const validModes = ["polish", "to_en"];
  if (!validModes.includes(mode)) {
    return sendDefinedError(res, "INVALID_INPUT", "Invalid mode");
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
        switch (r.status) {
          case 400:
            mapped = {
              code: "INVALID_INPUT",
              message: "Invalid input",
            };
            break;
          case 401:
            mapped = { code: "UNAUTHORIZED", message: "Unauthorized" };
            break;
          case 402:
            mapped = {
              code: "PAYMENT_REQUIRED",
              message: "Payment required",
            };
            break;
          case 408:
          case 504:
            mapped = { code: "TIMEOUT", message: "Request timed out" };
            break;
          case 429:
            mapped = { code: "RATE_LIMITED", message: "Too many requests" };
            break;
          default:
            mapped = { code: "UPSTREAM_ERROR", message: "Upstream service error" };
            break;
        }
        const definition = getErrorDefinition(mapped.code);
        const error = {
          ok: false,
          error: proxyError(
            mapped.code,
            mapped.message,
            definition.status,
            definition.retryable
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
      const code = isTimeout ? "TIMEOUT" : "UPSTREAM_ERROR";
      const definition = getErrorDefinition(code);
      const error = {
        ok: false,
        error: proxyError(
          code,
          definition.message,
          definition.status,
          definition.retryable
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
    return sendDefinedError(res, "INVALID_INPUT", "Invalid JSON");
  }
  return sendDefinedError(res, "INTERNAL_ERROR");
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
