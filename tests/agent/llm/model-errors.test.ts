import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isModelError,
  modelAuthFailed,
  modelInvalidResponse,
  modelNotConfigured,
  modelRateLimited,
  modelSchemaViolation,
  modelTimeout,
  modelUnavailable,
  structuredOutputInvalid,
  structuredOutputRetryExhausted,
  structuredOutputUnsupported,
} from "../../../src/lib/agent/llm/model-errors";

describe("model-errors", () => {
  describe("constructors", () => {
    it("modelNotConfigured is not retryable", () => {
      const err = modelNotConfigured("test reason");
      assert.equal(err.code, "MODEL_NOT_CONFIGURED");
      assert.equal(err.retryable, false);
      assert.ok(err.safeMessage.length > 0);
    });

    it("modelUnavailable is retryable", () => {
      const err = modelUnavailable("openai");
      assert.equal(err.code, "MODEL_UNAVAILABLE");
      assert.equal(err.retryable, true);
      assert.equal(err.provider, "openai");
    });

    it("modelRateLimited is retryable", () => {
      const err = modelRateLimited("openai", "gpt-4");
      assert.equal(err.code, "MODEL_RATE_LIMITED");
      assert.equal(err.retryable, true);
      assert.equal(err.provider, "openai");
      assert.equal(err.model, "gpt-4");
    });

    it("modelAuthFailed is not retryable", () => {
      const err = modelAuthFailed("openai");
      assert.equal(err.code, "MODEL_AUTH_FAILED");
      assert.equal(err.retryable, false);
    });

    it("modelTimeout includes timeout in message", () => {
      const err = modelTimeout(30000, "deepseek");
      assert.equal(err.code, "MODEL_TIMEOUT");
      assert.equal(err.retryable, true);
      assert.ok(err.safeMessage.includes("30s"));
    });

    it("modelInvalidResponse includes detail", () => {
      const err = modelInvalidResponse("empty body", "zai", "model-v1");
      assert.equal(err.code, "MODEL_INVALID_RESPONSE");
      assert.equal(err.retryable, true);
      assert.ok(err.safeMessage.includes("empty body"));
    });

    it("modelSchemaViolation is retryable", () => {
      const err = modelSchemaViolation("missing field: name");
      assert.equal(err.code, "MODEL_SCHEMA_VIOLATION");
      assert.equal(err.retryable, true);
    });

    it("structuredOutputUnsupported is not retryable", () => {
      const err = structuredOutputUnsupported("unknown-provider", "model-x");
      assert.equal(err.code, "STRUCTURED_OUTPUT_UNSUPPORTED");
      assert.equal(err.retryable, false);
    });

    it("structuredOutputInvalid is retryable", () => {
      const err = structuredOutputInvalid("type mismatch");
      assert.equal(err.code, "STRUCTURED_OUTPUT_INVALID");
      assert.equal(err.retryable, true);
    });

    it("structuredOutputRetryExhausted is not retryable", () => {
      const err = structuredOutputRetryExhausted(2, "openai", "gpt-4");
      assert.equal(err.code, "STRUCTURED_OUTPUT_RETRY_EXHAUSTED");
      assert.equal(err.retryable, false);
      assert.ok(err.safeMessage.includes("2"));
    });
  });

  describe("safeMessage never leaks secrets", () => {
    const secretPatterns = [
      /sk-[a-zA-Z0-9]{10,}/,
      /Bearer/i,
      /api[_.-]?key/i,
      /token/i,
      /secret/i,
      /password/i,
      /Authorization/i,
      /x-api-key/i,
    ];

    const allConstructors = [
      modelNotConfigured("test"),
      modelUnavailable("openai"),
      modelRateLimited("openai", "gpt-4"),
      modelAuthFailed("openai"),
      modelTimeout(60000),
      modelInvalidResponse("error", "openai"),
      modelSchemaViolation("error"),
      structuredOutputUnsupported("openai"),
      structuredOutputInvalid("error"),
      structuredOutputRetryExhausted(1),
    ];

    for (const err of allConstructors) {
      it(`safeMessage of ${err.code} has no secret patterns`, () => {
        for (const pattern of secretPatterns) {
          assert.ok(
            !pattern.test(err.safeMessage),
            `"${err.code}" safeMessage matches ${pattern}: "${err.safeMessage}"`,
          );
        }
      });
    }
  });

  describe("isModelError type guard", () => {
    it("returns true for ModelError objects", () => {
      assert.equal(isModelError(modelNotConfigured("test")), true);
      assert.equal(isModelError(modelUnavailable("openai")), true);
    });

    it("returns false for plain Error", () => {
      assert.equal(isModelError(new Error("test")), false);
    });

    it("returns false for null/undefined", () => {
      assert.equal(isModelError(null), false);
      assert.equal(isModelError(undefined), false);
    });

    it("returns false for plain object without code", () => {
      assert.equal(isModelError({ message: "test" }), false);
    });

    it("returns false for string", () => {
      assert.equal(isModelError("error"), false);
    });
  });

  describe("error discrimination by code", () => {
    it("each error has a unique, stable code", () => {
      const codes = new Set<string>();

      for (const err of [
        modelNotConfigured("a"),
        modelUnavailable("a"),
        modelRateLimited("a", "b"),
        modelAuthFailed("a"),
        modelTimeout(1000),
        modelInvalidResponse("a"),
        modelSchemaViolation("a"),
        structuredOutputUnsupported("a"),
        structuredOutputInvalid("a"),
        structuredOutputRetryExhausted(1),
      ]) {
        codes.add(err.code);
      }

      /* All 10 codes should be unique */
      assert.equal(codes.size, 10);
    });
  });
});
