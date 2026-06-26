import assert from "node:assert/strict";
import { test } from "node:test";

const { parseLLMRouterOutputWithRetry } = await import(
  "../../src/lib/agent/router/llm-router-schema"
);

test("retries on first invalid JSON instead of throwing", async () => {
  let parseCalls = 0;
  let retryCalls = 0;

  const result = await parseLLMRouterOutputWithRetry(
    () => {
      parseCalls += 1;
      return "{not valid json";
    },
    async () => {
      retryCalls += 1;
      return JSON.stringify({
        action: "clarify",
        confidence: 0.5,
        needsClarification: true,
        requiresConfirmation: false,
        riskLevel: "none",
        target: "unknown",
        userVisibleReason: "fallback after retry",
        writeRequired: false,
      });
    },
  );

  assert.equal(parseCalls, 1);
  assert.equal(retryCalls, 1);
  assert.equal(result.retried, true);
  assert.equal(result.output.action, "clarify");
});

test("does not retry when first parse succeeds", async () => {
  let parseCalls = 0;
  let retryCalls = 0;

  const result = await parseLLMRouterOutputWithRetry(
    () => {
      parseCalls += 1;
      return JSON.stringify({
        action: "query",
        confidence: 0.9,
        needsClarification: false,
        requiresConfirmation: false,
        riskLevel: "none",
        target: "schedule",
        userVisibleReason: "query schedule",
        writeRequired: false,
      });
    },
    async () => {
      retryCalls += 1;
      return null;
    },
  );

  assert.equal(parseCalls, 1);
  assert.equal(retryCalls, 0);
  assert.equal(result.retried, false);
  assert.equal(result.output.action, "query");
});

test("falls back to clarify when both attempts fail", async () => {
  const result = await parseLLMRouterOutputWithRetry(
    () => "{also not json",
    async () => "{still not json",
  );

  assert.equal(result.retried, true);
  assert.equal(result.output.action, "clarify");
  assert.equal(result.output.needsClarification, true);
});
