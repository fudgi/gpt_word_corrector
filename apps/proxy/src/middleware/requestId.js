import crypto from "node:crypto";

function requestIdMiddleware(req, res, next) {
  const id = req.get("X-Request-Id") || crypto.randomBytes(8).toString("hex");

  res.locals.requestId = id;
  res.set("X-Request-Id", id);
  next();
}

export { requestIdMiddleware };
