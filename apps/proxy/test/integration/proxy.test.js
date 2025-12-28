import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { tmpdir } from "node:os";
import request from "supertest";
import {
  ERROR_DEFINITIONS,
  MAX_TEXT_LENGTH,
} from "../../../shared-contract/index.js";

process.env.OPENAI_API_KEY ??= "test-key";
process.env.CORRECTOR_TEST = "1";

const mockOpenai = {
  async callOpenAI({ text, mode }) {
    const output =
      mode === "polish" && text === "helo" ? "hello" : "OK";
    return { ok: true, status: 200, data: { output } };
  },
  async handleUnexpectedOpenAIError() {
    return {
      ok: false,
      status: ERROR_DEFINITIONS.UPSTREAM_UNAVAILABLE.status,
      error: {
        code: "UPSTREAM_UNAVAILABLE",
        message: ERROR_DEFINITIONS.UPSTREAM_UNAVAILABLE.message,
        retry_after_ms: 0,
      },
    };
  },
};

async function buildApp(dbPath) {
  const { createApp } = await import("../../src/app.js");
  return createApp({
    deps: { openai: mockOpenai },
    configOverrides: { DB_PATH: dbPath },
  });
}

function makeDbPath() {
  return path.join(tmpdir(), `proxy-test-${randomUUID()}.sqlite`);
}

async function registerInstall(app, installId = randomUUID()) {
  const response = await request(app)
    .post("/v1/register")
    .send({ install_id: installId });
  return response.body.install_token;
}

test("register returns token", async () => {
  const app = await buildApp(makeDbPath());
  const response = await request(app)
    .post("/v1/register")
    .send({ install_id: randomUUID() });

  assert.equal(response.status, 200);
  assert.ok(response.body.install_token.startsWith("tok_"));
});

test("transform requires auth", async () => {
  const app = await buildApp(makeDbPath());
  const response = await request(app)
    .post("/v1/transform")
    .send({ text: "helo", mode: "polish" });

  assert.equal(response.status, ERROR_DEFINITIONS.UNAUTHORIZED.status);
  assert.equal(response.body.error.code, "UNAUTHORIZED");
  assert.equal(
    response.body.error.message,
    ERROR_DEFINITIONS.UNAUTHORIZED.message
  );
});

test("transform works with token", async () => {
  const app = await buildApp(makeDbPath());
  const token = await registerInstall(app);
  const response = await request(app)
    .post("/v1/transform")
    .set("Authorization", `Bearer ${token}`)
    .send({ text: "helo", mode: "polish" });

  assert.equal(response.status, 200);
  assert.equal(response.body.output, "hello");
});

test("token persists across app recreation", async () => {
  const dbPath = makeDbPath();
  const appOne = await buildApp(dbPath);
  const token = await registerInstall(appOne);

  const appTwo = await buildApp(dbPath);
  const response = await request(appTwo)
    .post("/v1/transform")
    .set("Authorization", `Bearer ${token}`)
    .send({ text: "helo", mode: "polish" });

  assert.equal(response.status, 200);
  assert.equal(response.body.output, "hello");
});

test("token rotation invalidates old token", async () => {
  const app = await buildApp(makeDbPath());
  const installId = randomUUID();
  const tokenOne = await registerInstall(app, installId);
  const tokenTwo = await registerInstall(app, installId);

  const validResponse = await request(app)
    .post("/v1/transform")
    .set("Authorization", `Bearer ${tokenTwo}`)
    .send({ text: "helo", mode: "polish" });
  assert.equal(validResponse.status, 200);

  const invalidResponse = await request(app)
    .post("/v1/transform")
    .set("Authorization", `Bearer ${tokenOne}`)
    .send({ text: "helo", mode: "polish" });
  assert.equal(
    invalidResponse.status,
    ERROR_DEFINITIONS.UNAUTHORIZED.status
  );
  assert.equal(invalidResponse.body.error.code, "UNAUTHORIZED");
});

test("CORRECTOR_TEST forced errors via header and body", async () => {
  const app = await buildApp(makeDbPath());
  const token = await registerInstall(app);

  const headerResponse = await request(app)
    .post("/v1/transform")
    .set("Authorization", `Bearer ${token}`)
    .set("X-Test-Error", "PAYMENT_REQUIRED")
    .send({ text: "helo", mode: "polish" });

  assert.equal(
    headerResponse.status,
    ERROR_DEFINITIONS.PAYMENT_REQUIRED.status
  );
  assert.equal(headerResponse.body.error.code, "PAYMENT_REQUIRED");

  const bodyResponse = await request(app)
    .post("/v1/transform")
    .set("Authorization", `Bearer ${token}`)
    .send({ text: "helo", mode: "polish", test_error: "BANNED" });

  assert.equal(bodyResponse.status, ERROR_DEFINITIONS.BANNED.status);
  assert.equal(bodyResponse.body.error.code, "BANNED");
});

test("validation errors return INVALID_REQUEST", async () => {
  const app = await buildApp(makeDbPath());
  const token = await registerInstall(app);

  const invalidMode = await request(app)
    .post("/v1/transform")
    .set("Authorization", `Bearer ${token}`)
    .send({ text: "helo", mode: "unsupported" });
  assert.equal(invalidMode.status, ERROR_DEFINITIONS.INVALID_REQUEST.status);
  assert.equal(invalidMode.body.error.code, "INVALID_REQUEST");

  const emptyText = await request(app)
    .post("/v1/transform")
    .set("Authorization", `Bearer ${token}`)
    .send({ text: "   ", mode: "polish" });
  assert.equal(emptyText.status, ERROR_DEFINITIONS.INVALID_REQUEST.status);
  assert.equal(emptyText.body.error.code, "INVALID_REQUEST");

  const longText = "a".repeat(MAX_TEXT_LENGTH + 1);
  const tooLong = await request(app)
    .post("/v1/transform")
    .set("Authorization", `Bearer ${token}`)
    .send({ text: longText, mode: "polish" });
  assert.equal(tooLong.status, ERROR_DEFINITIONS.INVALID_REQUEST.status);
  assert.equal(tooLong.body.error.code, "INVALID_REQUEST");
});
