import fetch from "node-fetch";
import { getErrorDefinition, getRetryAfterMs } from "./errors.js";
import { proxyError } from "../../../shared-contract/index.js";

async function callOpenAI({ text, mode, apiKey, timeoutMs }) {
  const prompts = {
    polish: "Improve grammar and tone. Keep meaning.",
    to_en: "Translate to natural English. Fix grammar.",
  };

  const system = `You are a writing assistant. ${prompts[mode]} Return only the result, no explanations.`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let response;

  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
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

  if (!response.ok) {
    const errorText = await response.text();
    let mapped;
    let retryAfterMs = 0;
    switch (response.status) {
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
        retryAfterMs = getRetryAfterMs(response.headers.get("retry-after"));
        break;
      default:
        mapped = {
          code: "UPSTREAM_UNAVAILABLE",
          message: "Upstream service error",
        };
        break;
    }
    const definition = getErrorDefinition(mapped.code);
    return {
      ok: false,
      status: definition.status,
      error: proxyError(mapped.code, mapped.message, retryAfterMs).error,
      retryAfterMs,
      errorText,
      upstreamStatus: response.status,
      mappedCode: mapped.code,
    };
  }

  const data = await response.json();
  const output = data.choices?.[0]?.message?.content?.trim() || "";
  return { ok: true, status: 200, data: { output } };
}

async function handleUnexpectedOpenAIError(error) {
  const isTimeout = error?.name === "AbortError";
  const code = "UPSTREAM_UNAVAILABLE";
  const definition = getErrorDefinition(code);
  return {
    ok: false,
    status: definition.status,
    error: proxyError(
      code,
      isTimeout ? "Upstream timeout" : definition.message
    ).error,
  };
}

export { callOpenAI, handleUnexpectedOpenAIError };
