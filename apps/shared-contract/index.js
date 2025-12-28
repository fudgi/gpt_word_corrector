export const ERROR_DEFINITIONS = {
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
  RATE_LIMITED: {
    status: 429,
    message: "Too many requests",
  },
  UPSTREAM_UNAVAILABLE: {
    status: 503,
    message: "Upstream unavailable",
  },
  INTERNAL: {
    status: 500,
    message: "Internal error",
  },
};

export const ERROR_CODES = Object.freeze(Object.keys(ERROR_DEFINITIONS));

export const ERROR_RESPONSE_SHAPE = {
  error: {
    code: "",
    message: "",
    retry_after_ms: 0,
  },
};

export function proxyError(code, message, retryAfterMs = 0) {
  return {
    error: {
      code,
      message,
      retry_after_ms: retryAfterMs,
    },
  };
}

export const VALID_MODES = Object.freeze(["polish", "to_en"]);
export const MAX_TEXT_LENGTH = 2000;
