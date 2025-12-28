import http from "node:http";

// Mock proxy server for tests
// Supports validation like real server, but uses mock responses for extension tests

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Create mock proxy server
export function createMockProxyServer() {
  // Simple in-memory cache for mock server
  const cache = new Map();
  const errorDefinitions = {
    RATE_LIMITED: {
      status: 429,
      message: "Too many requests",
    },
    UPSTREAM_UNAVAILABLE: {
      status: 503,
      message: "Upstream unavailable",
    },
    INVALID_REQUEST: {
      status: 400,
      message: "Invalid request",
    },
    UNAUTHORIZED: {
      status: 401,
      message: "Unauthorized",
    },
    PAYMENT_REQUIRED: {
      status: 402,
      message: "Payment required",
    },
    BANNED: {
      status: 403,
      message: "Banned",
    },
    INTERNAL: {
      status: 500,
      message: "Internal error",
    },
  };

  const writeError = (res, code, messageOverride, retryAfterMs = 0) => {
    const normalizedCode =
      errorDefinitions[code] ? code : "INTERNAL";
    const definition =
      errorDefinitions[normalizedCode] || errorDefinitions.INTERNAL;
    res.writeHead(definition.status, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: {
          code: normalizedCode,
          message: messageOverride || definition.message,
          retry_after_ms: retryAfterMs,
        },
      })
    );
  };

  const issuedTokens = new Map();
  const isValidUuid = (value) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    );

  const proxyServer = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/v1/register") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        try {
          const parsed = JSON.parse(body || "{}");
          const { install_id: installId, version } = parsed;
          if (!installId || typeof installId !== "string" || !isValidUuid(installId)) {
            writeError(res, "INVALID_REQUEST", "Invalid install_id");
            return;
          }
          if (version !== undefined && typeof version !== "string") {
            writeError(res, "INVALID_REQUEST", "Invalid version");
            return;
          }
          const token = `tok_${installId}`;
          issuedTokens.set(token, { installId });
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ install_token: token }));
        } catch (e) {
          writeError(res, "INTERNAL");
        }
      });
      return;
    }

    if (req.method === "POST" && req.url === "/v1/transform") {
      const authHeader = req.headers.authorization || "";
      const match = authHeader.match(/^Bearer\s+(.+)$/i);
      const bearerToken = match ? match[1].trim() : "";
      if (!bearerToken || !issuedTokens.has(bearerToken)) {
        writeError(res, "UNAUTHORIZED");
        return;
      }

      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        try {
          const parsed = JSON.parse(body || "{}");
          const {
            mode = "polish",
            text = "",
            style = "neutral",
            test_error,
          } = parsed;

          const forcedError = req.headers["x-test-error"] || test_error;
          if (typeof forcedError === "string" && forcedError.length > 0) {
            writeError(res, forcedError);
            return;
          }

          // Input validation (same as real server)
          if (!text || typeof text !== "string" || text.trim().length === 0) {
            writeError(res, "INVALID_REQUEST", "Text is required");
            return;
          }

          if (text.length > 2000) {
            writeError(res, "INVALID_REQUEST", "Text too long (max 2000 chars)");
            return;
          }

          const validModes = ["polish", "to_en"];
          if (!validModes.includes(mode)) {
            writeError(res, "INVALID_REQUEST", "Invalid mode");
            return;
          }

          // Check for special test cases first (before cache to ensure correct output)
          const trimmedText = text.trim();
          const normalizedText = trimmedText.replace(/\s+/g, " ").trim();
          let isSpecialCase = false;
          let output;

          // Debug logging (stderr to ensure visibility)
          process.stderr.write(
            `[MOCK] mode=${mode}, text="${text}", len=${
              text.length
            }, norm="${normalizedText}", lower="${text.toLowerCase()}"\n`
          );

          // Check exact matches first (most specific) - case insensitive
          const lowerText = normalizedText.toLowerCase();
          if (mode === "polish" && lowerText === "helo world") {
            output = "Hello, world!";
            isSpecialCase = true;
          } else if (mode === "polish" && lowerText === "helo") {
            // Handle single word "helo"
            output = "Hello";
            isSpecialCase = true;
          } else if (mode === "to_en" && lowerText === "bonjour le monde") {
            output = "Hello world";
            isSpecialCase = true;
          }

          // If it's a special case, return immediately (skip cache)
          if (isSpecialCase) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ output, cached: false }));
            return;
          }

          // Check cache for non-special cases
          const cacheKey = `${mode}:${style}:${text}`;
          const cached = cache.get(cacheKey);
          if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ output: cached.output, cached: true }));
            return;
          }

          // Mock response for other texts
          if (mode === "to_en") {
            output =
              text.charAt(0).toUpperCase() + text.slice(1) + " (translated)";
          } else {
            output = text.charAt(0).toUpperCase() + text.slice(1) + " (mocked)";
          }

          // Save to cache
          cache.set(cacheKey, { output, timestamp: Date.now() });

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ output, cached: false }));
        } catch (e) {
          writeError(res, "INTERNAL");
        }
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  return proxyServer;
}

// Start mock proxy server
export async function startMockProxyServer(port = 8787, host = "127.0.0.1") {
  const proxyServer = createMockProxyServer();

  await new Promise((resolve) => proxyServer.listen(port, host, resolve));

  console.log(`✅ Mock proxy server started on http://${host}:${port}`);

  return proxyServer;
}

// Stop mock proxy server
export async function stopMockProxyServer(proxyServer) {
  if (proxyServer) {
    await new Promise((resolve) => proxyServer.close(resolve));
    console.log("✅ Mock proxy server stopped");
  }
}
