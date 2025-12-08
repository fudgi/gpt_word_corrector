const http = require("http");

const PORT = 8787;
const HOST = "localhost";

function createResponse(text) {
  return JSON.stringify({ output: `[TEST_MODE] ${text}`, cached: false });
}

const server = http.createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/v1/transform") {
    res.statusCode = 404;
    return res.end("Not Found");
  }

  if (process.env.CORRECTOR_TEST !== "1") {
    res.statusCode = 500;
    return res.end("CORRECTOR_TEST env var must be set to 1");
  }

  let body = "";
  req.on("data", (chunk) => {
    body += chunk.toString();
  });

  req.on("end", () => {
    try {
      const payload = JSON.parse(body || "{}") || {};
      const text = payload.text || "";
      const response = createResponse(text);

      res.setHeader("Content-Type", "application/json");
      res.writeHead(200);
      res.end(response);
    } catch (err) {
      res.statusCode = 400;
      res.end("Bad Request");
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Test proxy server listening on http://${HOST}:${PORT}`);
});

module.exports = server;
