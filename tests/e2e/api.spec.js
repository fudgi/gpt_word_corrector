import { test, expect } from "@playwright/test";

test.describe("Transform API", () => {
  test.describe("Input Validation", () => {
    test("rejects empty text", async ({ request }) => {
      const response = await request.post("/v1/transform", {
        data: { mode: "polish", text: "" },
      });

      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("Text is required");
    });

    test("rejects missing text field", async ({ request }) => {
      const response = await request.post("/v1/transform", {
        data: { mode: "polish" },
      });

      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("Text is required");
    });

    test("rejects text exceeding 2000 characters", async ({ request }) => {
      const longText = "a".repeat(2001);
      const response = await request.post("/v1/transform", {
        data: { mode: "polish", text: longText },
      });

      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("Text too long (max 2000 chars)");
    });

    test("rejects invalid mode", async ({ request }) => {
      const response = await request.post("/v1/transform", {
        data: { mode: "invalid_mode", text: "Hello world" },
      });

      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("Invalid mode");
    });
  });

  // These tests require a valid OPENAI_API_KEY and make real API calls
  // Run sequentially to avoid race conditions
  test.describe("Text Transformation", () => {
    test.describe.configure({ mode: "serial" });

    test("polish mode corrects text", async ({ request }) => {
      const response = await request.post("/v1/transform", {
        data: {
          mode: "polish",
          text: "hello world, this is a test",
        },
        timeout: 30000,
      });

      expect(response.ok()).toBeTruthy();
      const body = await response.json();
      expect(body.output).toBeDefined();
      expect(typeof body.output).toBe("string");
      expect(body.output.length).toBeGreaterThan(0);
    });

    test("to_en mode translates text", async ({ request }) => {
      const response = await request.post("/v1/transform", {
        data: {
          mode: "to_en",
          text: "Bonjour le monde",
        },
        timeout: 30000,
      });

      expect(response.ok()).toBeTruthy();
      const body = await response.json();
      expect(body.output).toBeDefined();
      expect(typeof body.output).toBe("string");
      expect(body.output.length).toBeGreaterThan(0);
    });

    test("returns cached response on duplicate request", async ({
      request,
    }) => {
      const testText = `Cache test ${Date.now()}`;

      // First request - should not be cached
      const response1 = await request.post("/v1/transform", {
        data: { mode: "polish", text: testText },
        timeout: 30000,
      });
      expect(response1.ok()).toBeTruthy();
      const body1 = await response1.json();
      expect(body1.cached).toBeFalsy();

      // Second request with same text - should be cached
      const response2 = await request.post("/v1/transform", {
        data: { mode: "polish", text: testText },
        timeout: 30000,
      });
      expect(response2.ok()).toBeTruthy();
      const body2 = await response2.json();
      expect(body2.cached).toBe(true);
      expect(body2.output).toBe(body1.output);
    });
  });
});
