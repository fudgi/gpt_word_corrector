import {
  MAX_TEXT_LENGTH,
  VALID_MODES,
} from "../../../shared-contract/index.js";

function transformRoute({ auth, cache, dedupe, openai, validate, errors, config }) {
  return async (req, res) => {
    const bearerToken = auth.getBearerToken(req);
    if (!bearerToken) {
      return errors.sendDefinedError(res, "UNAUTHORIZED");
    }

    const tokenRecord = auth.getTokenRecord(bearerToken);
    if (!tokenRecord) {
      return errors.sendDefinedError(res, "UNAUTHORIZED");
    }

    if (tokenRecord.banned) {
      return errors.sendDefinedError(res, "BANNED");
    }

    const rateLimit = auth.checkTokenRateLimit(tokenRecord);
    if (rateLimit.limited) {
      if (rateLimit.retryAfterMs > 0) {
        res.set("Retry-After", Math.ceil(rateLimit.retryAfterMs / 1000));
      }
      return errors.sendDefinedError(
        res,
        "RATE_LIMITED",
        undefined,
        rateLimit.retryAfterMs
      );
    }

    tokenRecord.lastSeen = Date.now();

    const {
      mode = "polish",
      text = "",
      style = "neutral",
      test_error,
    } = req.body || {};

    if (process.env.CORRECTOR_TEST === "1") {
      const forcedError =
        req.get("X-Test-Error") || (typeof test_error === "string" && test_error);
      if (forcedError) {
        return errors.sendDefinedError(res, forcedError);
      }
    }

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return errors.sendDefinedError(res, "INVALID_REQUEST", "Text is required");
    }

    if (text.length > MAX_TEXT_LENGTH) {
      return errors.sendDefinedError(
        res,
        "INVALID_REQUEST",
        `Text too long (max ${MAX_TEXT_LENGTH} chars)`
      );
    }

    if (!VALID_MODES.includes(mode)) {
      return errors.sendDefinedError(res, "INVALID_REQUEST", "Invalid mode");
    }

    const cacheKey = cache.makeCacheKey({ mode, style, text });
    const cached = cache.getCacheEntry(cacheKey);
    if (cached && Date.now() - cached.timestamp < cache.CACHE_TTL) {
      console.log({
        request_id: res.locals.requestId,
        install_id: tokenRecord?.installId,
        mode,
        len: text.length,
        cached: true,
      });
      return res.json({ output: cached.output, cached: true });
    }

    const requestPromise = dedupe.dedupeRequest(cacheKey, async () => {
      try {
        const startTime = Date.now();
        console.log({
          request_id: res.locals.requestId,
          install_id: tokenRecord?.installId,
          mode,
          len: text.length,
          cached: false,
        });

        const response = await openai.callOpenAI({
          text,
          mode,
          apiKey: config.OPENAI_API_KEY,
          timeoutMs: config.OPENAI_TIMEOUT_MS,
        });

        if (!response.ok) {
          if (response.errorText !== undefined) {
            console.error({
              request_id: res.locals.requestId,
              install_id: tokenRecord?.installId,
              error: `OpenAI API error: ${response.upstreamStatus} - ${response.errorText}`,
            });
          }
          return {
            ok: false,
            error: response.error,
            status: response.status,
          };
        }

        const output = response.data.output;
        if (output) {
          cache.setCacheEntry(cacheKey, output);
        }

        const processingTime = Date.now() - startTime;
        console.log({
          request_id: res.locals.requestId,
          install_id: tokenRecord?.installId,
          processing_time_ms: processingTime,
        });

        return { ok: true, status: 200, data: { output } };
      } catch (error) {
        return openai.handleUnexpectedOpenAIError(error);
      }
    });

    return requestPromise.then((result) => {
      if (!result.ok)
        return res.status(result.status).json({ error: result.error });
      return res.status(result.status).json(result.data);
    });
  };
}

export { transformRoute };
