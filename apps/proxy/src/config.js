import dotenv from "dotenv";

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error("❌ No OPENAI_API_KEY found. Add it to .env");
  process.exit(1);
}

const PORT = process.env.PORT || 8787;
const PROXY_ENV = process.env.PROXY_ENV || "local";

const CACHE_TTL = 5 * 60 * 1000;
const TOKEN_RATE_WINDOW_MS = 60_000;
const TOKEN_RATE_MAX = 60;
const OPENAI_TIMEOUT_MS = 15_000;

export {
  OPENAI_API_KEY,
  PORT,
  PROXY_ENV,
  CACHE_TTL,
  TOKEN_RATE_WINDOW_MS,
  TOKEN_RATE_MAX,
  OPENAI_TIMEOUT_MS,
};
