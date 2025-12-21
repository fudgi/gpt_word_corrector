import http from "node:http";

// Mock proxy server for tests
// Supports validation like real server, but uses mock responses for extension tests

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Create mock proxy server
export function createMockProxyServer() {
  // Simple in-memory cache for mock server
  const cache = new Map();

  const proxyServer = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/v1/transform") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        try {
          const parsed = JSON.parse(body || "{}");
          const { mode = "polish", text = "", style = "neutral" } = parsed;

          // Input validation (same as real server)
          if (!text || typeof text !== "string" || text.trim().length === 0) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Text is required" }));
            return;
          }

          if (text.length > 2000) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({ error: "Text too long (max 2000 chars)" })
            );
            return;
          }

          const validModes = ["polish", "to_en"];
          if (!validModes.includes(mode)) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid mode" }));
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
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(e) }));
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
