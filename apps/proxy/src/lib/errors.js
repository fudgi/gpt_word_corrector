import { ERROR_DEFINITIONS, proxyError } from "../../../shared-contract/index.js";

function sendProxyError(res, code, message, status, retryAfterMs = 0) {
  return res.status(status).json(proxyError(code, message, retryAfterMs));
}

function getErrorDefinition(code) {
  return ERROR_DEFINITIONS[code] || ERROR_DEFINITIONS.INTERNAL;
}

function getRetryAfterMs(headerValue) {
  if (!headerValue) return 0;
  const seconds = Number(headerValue);
  if (Number.isNaN(seconds)) {
    return 0;
  }
  return Math.max(0, seconds * 1000);
}

function sendDefinedError(res, code, messageOverride, retryAfterMs = 0) {
  const normalizedCode = ERROR_DEFINITIONS[code] ? code : "INTERNAL";
  const definition = getErrorDefinition(normalizedCode);
  return sendProxyError(
    res,
    normalizedCode,
    messageOverride || definition.message,
    definition.status,
    retryAfterMs
  );
}

export {
  sendProxyError,
  getErrorDefinition,
  getRetryAfterMs,
  sendDefinedError,
};
