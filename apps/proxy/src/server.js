import { createApp } from "./app.js";
import { PORT, PROXY_ENV } from "./config.js";

const app = createApp();

const server = app.listen(PORT, () => {
  console.log(`Proxy on http://localhost:${PORT} (env: ${PROXY_ENV})`);
});

server.on("error", (err) => {
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

function shutdown() {
  console.log("SIGTERM received, shutting down...");
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
