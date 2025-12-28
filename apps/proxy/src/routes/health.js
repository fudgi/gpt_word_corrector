import * as config from "../config.js";

export function healthRoute(_req, res) {
  res.json({
    ok: true,
    env: config.PROXY_ENV,
    time: Date.now(),
  });
}
