import express from "express";
import { requestIdMiddleware } from "./middleware/requestId.js";
import { createGlobalRateLimit } from "./middleware/globalRateLimit.js";
import { registerRoute } from "./routes/register.js";
import { transformRoute } from "./routes/transform.js";
import * as errors from "./lib/errors.js";
import { createAuth } from "./lib/auth.js";
import { createDb } from "./lib/db.js";
import * as validate from "./lib/validate.js";
import * as cache from "./lib/cache.js";
import * as dedupe from "./lib/dedupe.js";
import * as openai from "./lib/openai.js";
import * as config from "./config.js";

function createApp({ deps = {}, configOverrides = {} } = {}) {
  const appConfig = { ...config, ...configOverrides };
  const openaiClient = deps.openai || openai;
  const db = createDb({ dbPath: appConfig.DB_PATH });
  const auth = createAuth({ db });
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());

  app.use(requestIdMiddleware);
  app.use(createGlobalRateLimit({ auth, errors }));

  app.post("/v1/register", registerRoute({ auth, validate, errors }));
  app.post(
    "/v1/transform",
    transformRoute({
      auth,
      cache,
      dedupe,
      openai: openaiClient,
      validate,
      errors,
      config: appConfig,
    })
  );

  app.use((err, _req, res, _next) => {
    if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
      return errors.sendDefinedError(res, "INVALID_REQUEST", "Invalid JSON");
    }
    return errors.sendDefinedError(res, "INTERNAL");
  });

  return app;
}

export { createApp };
