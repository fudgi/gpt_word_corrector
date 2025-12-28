import http from "node:http";
import {
  ERROR_DEFINITIONS,
  MAX_TEXT_LENGTH,
  VALID_MODES,
  proxyError,
} from "../../apps/shared-contract/index.js";

// Mock proxy server for tests
// Supports validation like real server, but uses mock responses for extension tests
// Store server reference in global scope so teardown can access it
export default async function globalSetup() {
  // Simple in-memory cache for mock server
  const cache = new Map();
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  const writeError = (res, code, messageOverride, retryAfterMs = 0) => {
    const normalizedCode =
      ERROR_DEFINITIONS[code] ? code : "INTERNAL";
    const definition =
      ERROR_DEFINITIONS[normalizedCode] || ERROR_DEFINITIONS.INTERNAL;
    res.writeHead(definition.status, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify(
        proxyError(
          normalizedCode,
          messageOverride || definition.message,
          retryAfterMs
        )
      )
    );
  };

  const issuedTokens = new Map();
  const isValidUuid = (value) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    );

  // Start proxy stub server (matches PROXY_ENDPOINT)
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

          if (text.length > MAX_TEXT_LENGTH) {
            writeError(
              res,
              "INVALID_REQUEST",
              `Text too long (max ${MAX_TEXT_LENGTH} chars)`
            );
            return;
          }

          if (!VALID_MODES.includes(mode)) {
            writeError(res, "INVALID_REQUEST", "Invalid mode");
            return;
          }

          // Check cache
          const cacheKey = `${mode}:${style}:${text}`;
          const cached = cache.get(cacheKey);
          if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ output: cached.output, cached: true }));
            return;
          }

          // Mock response - deterministic correction for extension tests
          const trimmedText = text.trim();
          const lowerText = trimmedText.toLowerCase();
          let output;
          let isSpecialCase = false;
          let delay = 0;

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
          } else if (trimmedText === "AAA") {
            // Special case: AAA with 300ms delay
            output = "AAA_CORRECTED";
            isSpecialCase = true;
            delay = 300;
          } else if (trimmedText === "BBB") {
            // Special case: BBB with 20ms delay
            output = "BBB_CORRECTED";
            isSpecialCase = true;
            delay = 20;
          }

          // Return with delay for special cases with delay (skip cache)
          if (isSpecialCase) {
            const sendResponse = () => {
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({ output, cached: false, delayMs: delay })
              );
            };

            if (delay > 0) {
              setTimeout(sendResponse, delay);
            } else {
              sendResponse();
            }
            return;
          }

          // Simple mock transformation for other texts
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

  await new Promise((resolve) =>
    proxyServer.listen(8787, "127.0.0.1", resolve)
  );

  // Store server reference in global scope for teardown
  global.__playwright_test_server__ = proxyServer;

  console.log("✅ Mock proxy server started on http://127.0.0.1:8787");
}
