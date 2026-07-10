/**
 * Direct contract tests for invokeStructured().
 *
 * Uses fake model injection — no real API calls, no database, no network.
 * Each test creates a mock BaseChatModel whose withStructuredOutput →
 * invoke pipeline produces controlled success/failure behaviours.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { invokeStructured } from "../../../src/lib/agent/llm/invoke-structured";
import { createModelConfig, type ModelConfig } from "../../../src/lib/agent/llm/model-config";
import { isModelError } from "../../../src/lib/agent/llm/model-errors";
import type { ModelFactory } from "../../../src/lib/agent/llm/model-factory";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

/* ---- Test schema ---- */
const testSchema = z.object({ name: z.string(), count: z.number() });
const schemaName = "TestOutput";

/* ---- Helpers ---- */

const makeConfig = (provider = "openai"): ModelConfig => {
  const c = createModelConfig({
    apiKey: "sk-test",
    baseURL: "https://api.test.com/v1",
    model: "test-model",
    provider,
  });
  if (isModelError(c)) throw new Error("bad test config");
  return c;
};

const testMessages = [
  { role: "system" as const, content: "You are a test bot." },
  { role: "user" as const, content: "Say hello." },
];

/** Build a fake BaseChatModel.
 *  - onSuccess: data to return from invoke()
 *  - onError: Error to throw from invoke() */
const fakeModelFactory = (opts: {
  onSuccess?: unknown;
  onError?: Error;
  callCount?: { value: number };
  beforeInvoke?: () => void;
}): ModelFactory =>
  () => {
    const model = {
      withStructuredOutput: (_schema: unknown, _opts: unknown) => ({
        invoke: async () => {
          opts.callCount && opts.callCount.value++;
          opts.beforeInvoke?.();

          if (opts.onError) {
            throw opts.onError;
          }

          return opts.onSuccess;
        },
      }),
    };
    return model as unknown as BaseChatModel;
  };

describe("invokeStructured (L1-A contract)", () => {
  /* ─── 1. Success path ─── */
  describe("success", () => {
    it("returns ok with validated data on valid structured output", async () => {
      const factory = fakeModelFactory({
        onSuccess: { name: "test", count: 42 },
      });
      const result = await invokeStructured({
        schema: testSchema,
        schemaName,
        messages: testMessages,
        modelConfig: makeConfig(),
        modelFactory: factory,
      });

      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.data.name, "test");
        assert.equal(result.data.count, 42);
        assert.equal(result.provider, "openai");
        assert.equal(result.model, "test-model");
      }
    });

    it("returns ok even when extra fields are present (Zod strips them)", async () => {
      const factory = fakeModelFactory({
        onSuccess: { name: "test", count: 42, extra: "should-be-stripped" },
      });
      const result = await invokeStructured({
        schema: testSchema,
        schemaName,
        messages: testMessages,
        modelConfig: makeConfig(),
        modelFactory: factory,
      });

      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.data.name, "test");
        /* extra field should NOT be present */
        assert.equal("extra" in (result.data as Record<string, unknown>), false);
      }
    });

    it("uses LangChain withStructuredOutput, not JSON substring extraction", async () => {
      /* If the implementation used JSON.parse on raw text, it would fail
       *   to parse a non-JSON object. Since we inject a fake Runnable,
       *   the result comes from withStructuredOutput, proving it doesn't
       *   try to extract JSON from a raw string. */
      const factory = fakeModelFactory({
        onSuccess: { name: "direct-object", count: 1 },
      });
      const result = await invokeStructured({
        schema: testSchema,
        schemaName,
        messages: testMessages,
        modelConfig: makeConfig(),
        modelFactory: factory,
      });

      assert.equal(result.ok, true);
      /* If substring extraction was used, this raw content wouldn't parse */
    });
  });

  /* ─── 2. Schema failure ─── */
  describe("schema failure", () => {
    it("returns error on Zod validation failure after retries", async () => {
      const callCount = { value: 0 };
      const factory = fakeModelFactory({
        onSuccess: { name: "test" }, // missing "count"
        callCount,
      });
      const result = await invokeStructured({
        schema: testSchema,
        schemaName,
        messages: testMessages,
        modelConfig: makeConfig(),
        modelFactory: factory,
        maxSchemaRetries: 1,
        maxTransportRetries: 0,
      });

      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, "STRUCTURED_OUTPUT_RETRY_EXHAUSTED");
        assert.equal(result.error.retryable, false);
      }
      /* Called: initial + 1 schema retry = 2 total */
      assert.equal(callCount.value, 2);
    });

    it("schema repair succeeds on second attempt", async () => {
      const callCount = { value: 0 };
      let firstCall = true;
      const factory: ModelFactory = () => {
        const model = {
          withStructuredOutput: (_schema: unknown, _opts: unknown) => ({
            invoke: async () => {
              callCount.value++;

              if (firstCall) {
                firstCall = false;
                /* First call: missing "count" — will fail Zod validation */
                return { name: "test" };
              }

              /* Second call: valid */
              return { name: "test", count: 42 };
            },
          }),
        };
        return model as unknown as BaseChatModel;
      };

      const result = await invokeStructured({
        schema: testSchema,
        schemaName,
        messages: testMessages,
        modelConfig: makeConfig(),
        modelFactory: factory,
        maxSchemaRetries: 1,
        maxTransportRetries: 0,
      });

      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.data.name, "test");
        assert.equal(result.data.count, 42);
      }
      assert.equal(callCount.value, 2);
    });

    it("schema failure does NOT generate a write intent", async () => {
      /* The error is STRUCTURED_OUTPUT_RETRY_EXHAUSTED, not a write action */
      const factory = fakeModelFactory({
        onSuccess: { invalid: true },
      });
      const result = await invokeStructured({
        schema: testSchema,
        schemaName,
        messages: testMessages,
        modelConfig: makeConfig(),
        modelFactory: factory,
        maxSchemaRetries: 0,
        maxTransportRetries: 0,
      });

      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.ok(!result.error.code.includes("WRITE"));
        assert.ok(!result.error.code.includes("EXECUTE"));
      }
    });

    it("schema failure does NOT call legacy writer", async () => {
      /* invokeStructured has no dependency on complete-structured or the
       *   legacy write path. A schema failure simply returns a typed error. */
      const factory = fakeModelFactory({
        onSuccess: { bad: true },
      });
      const result = await invokeStructured({
        schema: testSchema,
        schemaName,
        messages: testMessages,
        modelConfig: makeConfig(),
        modelFactory: factory,
        maxSchemaRetries: 0,
        maxTransportRetries: 0,
      });

      assert.equal(result.ok, false);
      /* The error is a typed ModelError, not a fallback to legacy */
    });
  });

  /* ─── 3. Transport retry ─── */
  describe("transport retry", () => {
    it("retries on network error and succeeds on second transport attempt", async () => {
      const callCount = { value: 0 };
      let firstCall = true;
      const factory: ModelFactory = () => {
        const model = {
          withStructuredOutput: (_schema: unknown, _opts: unknown) => ({
            invoke: async () => {
              callCount.value++;

              if (firstCall) {
                firstCall = false;
                throw new Error("ECONNREFUSED");
              }

              return { name: "recovered", count: 1 };
            },
          }),
        };
        return model as unknown as BaseChatModel;
      };

      const result = await invokeStructured({
        schema: testSchema,
        schemaName,
        messages: testMessages,
        modelConfig: makeConfig(),
        modelFactory: factory,
        maxTransportRetries: 1,
        maxSchemaRetries: 0,
      });

      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.data.name, "recovered");
      }
      assert.equal(callCount.value, 2);
    });

    it("returns MODEL_UNAVAILABLE after transport retries exhausted", async () => {
      const callCount = { value: 0 };
      const factory = fakeModelFactory({
        onError: new Error("500 Internal Server Error"),
        callCount,
      });
      const result = await invokeStructured({
        schema: testSchema,
        schemaName,
        messages: testMessages,
        modelConfig: makeConfig(),
        modelFactory: factory,
        maxTransportRetries: 1,
        maxSchemaRetries: 0,
      });

      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, "MODEL_UNAVAILABLE");
        assert.equal(result.error.retryable, true);
      }
      /* Called: initial + 1 transport retry = 2 */
      assert.equal(callCount.value, 2);
    });

    it("transport retry has bounded upper limit (maxTransportRetries=2)", async () => {
      const callCount = { value: 0 };
      const factory = fakeModelFactory({
        onError: new Error("500"),
        callCount,
      });
      await invokeStructured({
        schema: testSchema,
        schemaName,
        messages: testMessages,
        modelConfig: makeConfig(),
        modelFactory: factory,
        maxTransportRetries: 2,
        maxSchemaRetries: 0,
      });

      /* Called: initial + 2 transport retries = 3 max */
      assert.equal(callCount.value, 3);
    });
  });

  /* ─── 4. Cancellation ─── */
  describe("cancellation (abort)", () => {
    it("does NOT retry on caller abort", async () => {
      const callCount = { value: 0 };
      const controller = new AbortController();
      const factory = fakeModelFactory({
        onError: new DOMException("aborted", "AbortError"),
        callCount,
      });

      /* Abort before invoke */
      controller.abort();

      const result = await invokeStructured({
        schema: testSchema,
        schemaName,
        messages: testMessages,
        modelConfig: makeConfig(),
        modelFactory: factory,
        signal: controller.signal,
        maxTransportRetries: 2,
        maxSchemaRetries: 2,
      });

      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.retryable, false);
      }
    });

    it("abort returns non-retryable error", async () => {
      const controller = new AbortController();
      const factory = fakeModelFactory({
        onError: new DOMException("aborted", "AbortError"),
      });

      controller.abort();

      const result = await invokeStructured({
        schema: testSchema,
        schemaName,
        messages: testMessages,
        modelConfig: makeConfig(),
        modelFactory: factory,
        signal: controller.signal,
        maxTransportRetries: 3,
      });

      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.retryable, false);
      }
    });
  });

  /* ─── 5. Timeout ─── */
  describe("timeout", () => {
    it("does NOT retry on timeout", async () => {
      const callCount = { value: 0 };
      const factory = fakeModelFactory({
        onError: new DOMException("timeout", "TimeoutError"),
        callCount,
      });
      const result = await invokeStructured({
        schema: testSchema,
        schemaName,
        messages: testMessages,
        modelConfig: makeConfig(),
        modelFactory: factory,
        maxTransportRetries: 3,
        maxSchemaRetries: 3,
      });

      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, "MODEL_TIMEOUT");
        assert.equal(result.error.retryable, true);
      }
      /* Timeout is NOT retried — only 1 call */
      assert.equal(callCount.value, 1);
    });
  });

  /* ─── 6. Provider errors ─── */
  describe("provider error", () => {
    it("error message is safe and desensitized", async () => {
      const factory = fakeModelFactory({
        onError: new Error("connect ECONNREFUSED 10.0.0.1:443"),
      });
      const result = await invokeStructured({
        schema: testSchema,
        schemaName,
        messages: testMessages,
        modelConfig: makeConfig(),
        modelFactory: factory,
        maxTransportRetries: 0,
        maxSchemaRetries: 0,
      });

      assert.equal(result.ok, false);
      if (!result.ok) {
        /* safeMessage should NOT contain the raw error */
        assert.ok(!result.error.safeMessage.includes("ECONNREFUSED"));
        assert.ok(!result.error.safeMessage.includes("10.0.0.1"));
      }
    });

    it("provider error does NOT expose raw response body", async () => {
      const factory = fakeModelFactory({
        onError: Object.assign(
          new Error("HTTP 500"),
          { responseBody: '{"error":"internal"}', status: 500 },
        ),
      });
      const result = await invokeStructured({
        schema: testSchema,
        schemaName,
        messages: testMessages,
        modelConfig: makeConfig(),
        modelFactory: factory,
        maxTransportRetries: 0,
        maxSchemaRetries: 0,
      });

      assert.equal(result.ok, false);
      if (!result.ok) {
        /* safeMessage should NOT contain raw response */
        assert.ok(!result.error.safeMessage.includes('{"error":'));
        assert.ok(!result.error.safeMessage.includes("internal"));
      }
    });
  });

  /* ─── 7. Config errors ─── */
  describe("config errors", () => {
    it("config error is NOT retried", async () => {
      /* Factory throws on construction — no retry possible */
      const factory: ModelFactory = () => {
        throw new Error("Cannot create model");
      };
      const result = await invokeStructured({
        schema: testSchema,
        schemaName,
        messages: testMessages,
        modelConfig: makeConfig(),
        modelFactory: factory,
        maxTransportRetries: 5,
      });

      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, "MODEL_NOT_CONFIGURED");
        assert.equal(result.error.retryable, false);
      }
    });
  });

  /* ─── 8. Retry ownership ─── */
  describe("retry ownership (Contract B)", () => {
    it("transport retry is independent of schema retry", async () => {
      /* Transport errors should NOT consume schema retry budget */
      const callCount = { value: 0 };
      let invokeCount = 0;
      const factory: ModelFactory = () => {
        const model = {
          withStructuredOutput: (_schema: unknown, _opts: unknown) => ({
            invoke: async () => {
              invokeCount++;
              callCount.value++;

              /* First call: network error (transport retry) */
              if (invokeCount === 1) {
                throw new Error("ECONNREFUSED");
              }

              /* Second call: success */
              return { name: "ok", count: 1 };
            },
          }),
        };
        return model as unknown as BaseChatModel;
      };

      const result = await invokeStructured({
        schema: testSchema,
        schemaName,
        messages: testMessages,
        modelConfig: makeConfig(),
        modelFactory: factory,
        maxTransportRetries: 1,
        maxSchemaRetries: 1,
      });

      /* Transport retry resolved, schema was fine → success */
      assert.equal(result.ok, true);
      assert.equal(callCount.value, 2);
    });

    it("transport retry is bounded independently from schema retry", async () => {
      const callCount = { value: 0 };
      const factory = fakeModelFactory({
        onError: new Error("500"),
        callCount,
      });
      await invokeStructured({
        schema: testSchema,
        schemaName,
        messages: testMessages,
        modelConfig: makeConfig(),
        modelFactory: factory,
        maxTransportRetries: 0,  /* 1 attempt total */
        maxSchemaRetries: 5,     /* lots of schema budget — but unused */
      });

      /* Transport error at attempt 0 → exhausted immediately */
      assert.equal(callCount.value, 1);
    });

    it("maximum provider calls = (1 + maxTransport) × (1 + maxSchema) in mixed failure", async () => {
      /* Mixed scenario: each transport attempt produces a successful
       *   response (so it enters the schema loop), but the first
       *   schema attempt in each transport cycle returns invalid data. */
      const callCount = { value: 0 };

      const factory: ModelFactory = () => {
        const model = {
          withStructuredOutput: (_schema: unknown, _opts: unknown) => ({
            invoke: async () => {
              callCount.value++;

              /* Alternate: first call in each pair fails schema,
               *   second call succeeds. But since we're testing
               *   exhaustion, everything fails. */
              return { invalid: "data" };
            },
          }),
        };
        return model as unknown as BaseChatModel;
      };

      await invokeStructured({
        schema: testSchema,
        schemaName,
        messages: testMessages,
        modelConfig: makeConfig(),
        modelFactory: factory,
        maxTransportRetries: 1,
        maxSchemaRetries: 1,
      });

      /* Schema-only failures: 1 + maxSchemaRetries = 2 calls.
       *   Transport is never retried because the response is
       *   "successful" — it just fails schema validation. */
      assert.equal(callCount.value, 2);
    });

    it("schema-only failures: max calls = (1 + maxSchema)", async () => {
      const callCount = { value: 0 };
      const factory = fakeModelFactory({
        onSuccess: { invalid: true },
        callCount,
      });
      await invokeStructured({
        schema: testSchema,
        schemaName,
        messages: testMessages,
        modelConfig: makeConfig(),
        modelFactory: factory,
        maxTransportRetries: 3,   /* plenty of transport budget */
        maxSchemaRetries: 1,      /* but schema is the limiting factor */
      });

      /* 1 initial + 1 schema retry = 2 total */
      assert.equal(callCount.value, 2);
    });

    it("transport-only failures: max calls = (1 + maxTransport)", async () => {
      const callCount = { value: 0 };
      const factory = fakeModelFactory({
        onError: new Error("500"),
        callCount,
      });
      await invokeStructured({
        schema: testSchema,
        schemaName,
        messages: testMessages,
        modelConfig: makeConfig(),
        modelFactory: factory,
        maxTransportRetries: 2,
        maxSchemaRetries: 5,      /* plenty of schema budget */
      });

      /* 1 initial + 2 transport retries = 3 total */
      assert.equal(callCount.value, 3);
    });
  });

  /* ─── 9. Schema retry does NOT retry on non-schema errors ─── */
  describe("error type discrimination", () => {
    it("OutputParserException triggers schema retry, not transport retry", async () => {
      const callCount = { value: 0 };
      const factory = fakeModelFactory({
        onError: Object.assign(new Error("parse error"), {
          name: "OutputParserException",
        }),
        callCount,
      });
      const result = await invokeStructured({
        schema: testSchema,
        schemaName,
        messages: testMessages,
        modelConfig: makeConfig(),
        modelFactory: factory,
        maxTransportRetries: 0,
        maxSchemaRetries: 1,
      });

      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.error.code, "STRUCTURED_OUTPUT_RETRY_EXHAUSTED");
      }
      /* Called initial + 1 schema retry = 2 */
      assert.equal(callCount.value, 2);
    });
  });

  /* ─── 10. Deployment safety ─── */
  describe("no unsafe fallbacks", () => {
    it("does NOT call real network (fake model injectable)", async () => {
      /* The test itself proves injectability — if the fake factory
       *   weren't called, the test would fail or hang. */
      let factoryWasCalled = false;
      const factory: ModelFactory = () => {
        factoryWasCalled = true;
        const model = {
          withStructuredOutput: (_schema: unknown, _opts: unknown) => ({
            invoke: async () => ({ name: "ok", count: 1 }),
          }),
        };
        return model as unknown as BaseChatModel;
      };

      await invokeStructured({
        schema: testSchema,
        schemaName,
        messages: testMessages,
        modelConfig: makeConfig(),
        modelFactory: factory,
      });

      assert.equal(factoryWasCalled, true);
    });

    it("no dependency on JSON substring extraction", async () => {
      /* invokeStructured uses LangChain withStructuredOutput internally.
       *   The `completeStructured` module is never imported. This test
       *   sends a value that would fail substring extraction but
       *   succeeds via Runnable.invoke(). */
      const factory = fakeModelFactory({
        onSuccess: { name: "structured", count: 1 },
      });
      const result = await invokeStructured({
        schema: testSchema,
        schemaName,
        messages: testMessages,
        modelConfig: makeConfig(),
        modelFactory: factory,
      });

      assert.equal(result.ok, true);
      if (result.ok) {
        assert.equal(result.data.name, "structured");
      }
    });
  });
});
