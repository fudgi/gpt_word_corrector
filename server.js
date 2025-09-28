import express from "express";
import rateLimit from "express-rate-limit";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config(); // Load .env file

const app = express();
app.use(express.json());
app.use(rateLimit({ windowMs: 60_000, max: 60 }));

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
  const { mode = "polish", text = "", style = "neutral" } = req.body || {};

  // Input validation
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return res.status(400).json({ error: "Text is required" });
  }

  if (text.length > 2000) {
    return res.status(400).json({ error: "Text too long (max 2000 chars)" });
  }

  const validModes = ["polish", "to_en"];
  if (!validModes.includes(mode)) {
    return res.status(400).json({ error: "Invalid mode" });
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
    return new Promise((resolve) => {
      pendingRequests.get(cacheKey).push(resolve);
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
      // const prompts = {
      //   polish: "Improve grammar and tone. Keep meaning.",
      //   to_en: "Translate to natural English. Fix grammar.",
      // };

      // const system = `You are a writing assistant. ${prompts[mode]} Return only the result, no explanations.`;
      // const r = await fetch("https://api.openai.com/v1/chat/completions", {
      //   method: "POST",
      //   headers: {
      //     Authorization: `Bearer ${OPENAI_API_KEY}`,
      //     "Content-Type": "application/json",
      //   },
      //   body: JSON.stringify({
      //     model: "gpt-4o-mini",
      //     messages: [
      //       { role: "system", content: system },
      //       { role: "user", content: text },
      //     ],
      //     max_tokens: 500,
      //     temperature: 0.3,
      //   }),
      // });

      // if (!r.ok) {
      //   const errorText = await r.text();
      //   console.error(`OpenAI API error: ${r.status} - ${errorText}`);
      //   return res.status(500).json({
      //     error: `API error: ${r.status}`,
      //     details: r.status === 429 ? "Rate limit exceeded" : "Service error",
      //   });
      // }

      // const data = await r.json();
      // const output = data.choices?.[0]?.message?.content?.trim() || "";

      // // Save to cache
      // if (output) {
      //   cache.set(cacheKey, { output, timestamp: Date.now() });
      //   // Clean old cache entries
      //   if (cache.size > 1000) {
      //     const now = Date.now();
      //     for (const [key, value] of cache.entries()) {
      //       if (now - value.timestamp > CACHE_TTL) {
      //         cache.delete(key);
      //       }
      //     }
      //   }
      // }

      // const processingTime = Date.now() - startTime;
      // console.log(`Request completed in ${processingTime}ms`);

      // const result = { output };
      // resolvers.forEach((resolve) => resolve(result));
    } catch (e) {
      const error = { error: String(e) };
      resolvers.forEach((resolve) => resolve(error));
    } finally {
      pendingRequests.delete(cacheKey);
    }
  });

  return requestPromise.then((result) => {
    if (result.error) {
      return res.status(500).json(result);
    }
    return res.json(result);
  });
});

app.listen(8787, () => console.log("Proxy on http://localhost:8787"));
