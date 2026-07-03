/**
 * Transition Engine — Test Suite
 *
 * Phase 3: LLM Transition Engine validation, retry, fallback.
 * All tests use mocked LLM calls — no real LLM is invoked.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { createDefaultSessionState } from "../../../src/lib/agent/session/normalize-session";
import {
  runTransitionEngine,
  filterUnsafeOutput,
  type TransitionLLMCall,
} from "../../../src/lib/agent/session/transition-engine";
import {
  transitionOutputSchema,
  validateTransitionOutput,
  safeValidateTransitionOutput,
  isTransitionOutputSafe,
} from "../../../src/lib/agent/session/transition-schema";
import type { ValidatedTransitionOutput } from "../../../src/lib/agent/session/transition-schema";

/* ──── Helpers ──── */

/** Build a valid TransitionOutput JSON string */
const makeValidOutput = (overrides: Partial<Record<string, unknown>> = {}): string => {
  const output = {
    shouldUpdateSession: true,
    sessionPatch: {
      domain: "learning",
      stage: "exploring",
    },
    routeHint: {
      source: "transition_engine",
      contextualClues: ["user asked about machine learning"],
      expectedIntents: ["explain_concept"],
      confidence: 0.85,
    },
    transitionType: "switch_domain",
    reason: "User is asking a new learning question about ML",
    ...overrides,
  };
  return JSON.stringify(output);
};

/** Create a mock LLM call that returns a fixed response */
const mockLLM = (response: string): TransitionLLMCall =>
  async () => response;

/** Create a mock LLM call with sequenced responses */
const mockLLMSequence = (...responses: string[]): TransitionLLMCall => {
  let index = 0;
  return async () => {
    const response = responses[index] ?? responses[responses.length - 1]!;
    index++;
    return response;
  };
};

/* ═══════════════════════════════════════════════════════════════════════
   Schema Tests
   ═══════════════════════════════════════════════════════════════════════ */

test("transitionOutputSchema validates a valid output", () => {
  const raw = JSON.parse(makeValidOutput());
  const result = safeValidateTransitionOutput(raw);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.transitionType, "switch_domain");
    assert.equal(result.data.routeHint.source, "transition_engine");
  }
});

test("transitionOutputSchema rejects invalid enum values", () => {
  const raw = JSON.parse(makeValidOutput({ transitionType: "invalid_type" }));
  const result = safeValidateTransitionOutput(raw);
  assert.equal(result.success, false);
  assert.ok(result.error.includes("transitionType") || result.error.includes("enum"));
});

test("transitionOutputSchema rejects missing required fields", () => {
  const raw = { shouldUpdateSession: true };
  const result = safeValidateTransitionOutput(raw);
  assert.equal(result.success, false);
});

test("transitionOutputSchema rejects negative confidence", () => {
  const raw = JSON.parse(makeValidOutput());
  raw.routeHint.confidence = -0.5;
  const result = safeValidateTransitionOutput(raw);
  assert.equal(result.success, false);
});

test("transitionOutputSchema rejects confidence > 1", () => {
  const raw = JSON.parse(makeValidOutput());
  raw.routeHint.confidence = 1.5;
  const result = safeValidateTransitionOutput(raw);
  assert.equal(result.success, false);
});

/* ──── Safety Tests ──── */

test("isTransitionOutputSafe rejects executeTool", () => {
  const raw = JSON.parse(makeValidOutput());
  raw.routeHint.contextualClues.push("should executeTool to create");
  assert.equal(isTransitionOutputSafe(raw), false);
});

test("isTransitionOutputSafe rejects toolCall", () => {
  const raw = JSON.parse(makeValidOutput());
  raw.reason = "Need to make a toolCall for this";
  assert.equal(isTransitionOutputSafe(raw), false);
});

test("isTransitionOutputSafe rejects dryRun", () => {
  const raw = JSON.parse(makeValidOutput());
  raw.routeHint.expectedIntents.push("do dryRun first");
  assert.equal(isTransitionOutputSafe(raw), false);
});

test("isTransitionOutputSafe accepts clean output", () => {
  const raw = JSON.parse(makeValidOutput());
  assert.equal(isTransitionOutputSafe(raw), true);
});

test("validateTransitionOutput rejects output with executeTool", () => {
  const raw = JSON.parse(makeValidOutput());
  raw.routeHint.contextualClues.push("executeTool: create_schedule");
  assert.throws(
    () => {
      validateTransitionOutput(raw);
    },
    /forbidden/i,
  );
});

/* ──── Pre-Zod Raw Key Scan (Layer 1) ──── */

test("pre-Zod layer rejects executeTool as top-level key", () => {
  const raw = JSON.parse(makeValidOutput());
  raw.executeTool = "delete_plan";

  const result = safeValidateTransitionOutput(raw);
  assert.equal(result.success, false);
  assert.ok(result.error.includes("forbidden key"), `expected key-scan error, got: ${result.error}`);
  assert.ok(result.error.includes("executeTool"), `expected executeTool mention, got: ${result.error}`);
});

test("pre-Zod layer rejects toolCall as nested key", () => {
  const raw = JSON.parse(makeValidOutput());
  raw.routeHint.toolCall = { name: "delete", args: {} };

  const result = safeValidateTransitionOutput(raw);
  assert.equal(result.success, false);
  assert.ok(result.error.includes("forbidden key"), `expected key-scan error, got: ${result.error}`);
  assert.ok(result.error.includes("toolCall"), `expected toolCall mention, got: ${result.error}`);
});

test("pre-Zod layer rejects execute as top-level key", () => {
  const raw = JSON.parse(makeValidOutput());
  raw.execute = "delete_plan";

  const result = safeValidateTransitionOutput(raw);
  assert.equal(result.success, false);
  assert.ok(result.error.includes("forbidden key"));
});

test("pre-Zod layer rejects function_call key", () => {
  const raw = JSON.parse(makeValidOutput());
  raw.sessionPatch.function_call = "create_schedule";

  const result = safeValidateTransitionOutput(raw);
  assert.equal(result.success, false);
  assert.ok(result.error.includes("forbidden key"));
});

test("pre-Zod layer rejects actionToExecute key", () => {
  const raw = JSON.parse(makeValidOutput());
  raw.actionToExecute = "run query";

  const result = safeValidateTransitionOutput(raw);
  assert.equal(result.success, false);
  assert.ok(result.error.includes("forbidden key"));
});

test("pre-Zod layer passes clean output (no forbidden keys)", () => {
  const raw = JSON.parse(makeValidOutput());

  const result = safeValidateTransitionOutput(raw);
  assert.equal(result.success, true);
});

/* ──── Post-Zod Value Scan (Layer 3) ──── */

/* ═══════════════════════════════════════════════════════════════════════
   Engine Tests — Valid Output
   ═══════════════════════════════════════════════════════════════════════ */

test("engine returns validated output on first success", async () => {
  const session = createDefaultSessionState();
  const llm = mockLLM(makeValidOutput());

  const result = await runTransitionEngine(session, "Explain machine learning", llm);

  assert.equal(result.isFallback, false);
  assert.equal(result.didRetry, false);
  assert.equal(result.output.transitionType, "switch_domain");
  assert.equal(result.output.routeHint.source, "transition_engine");
  assert.ok(result.trace.firstAttemptRaw);
  assert.equal(result.trace.firstAttemptError, undefined);
});

/* ═══════════════════════════════════════════════════════════════════════
   Engine Tests — Retry on First Invalid
   ═══════════════════════════════════════════════════════════════════════ */

test("engine retries when first output is invalid JSON", async () => {
  const session = createDefaultSessionState();
  const llm = mockLLMSequence(
    "not valid json at all {{{",
    makeValidOutput(),
  );

  const result = await runTransitionEngine(session, "Hello", llm);

  assert.equal(result.isFallback, false);
  assert.equal(result.didRetry, true);
  assert.equal(result.output.transitionType, "switch_domain");
  assert.ok(result.trace.firstAttemptRaw?.includes("not valid json"));
  assert.ok(result.trace.firstAttemptError);
  assert.ok(result.trace.retryAttemptRaw);
});

test("engine retries when first output has invalid enum", async () => {
  const session = createDefaultSessionState();
  const llm = mockLLMSequence(
    makeValidOutput({ transitionType: "bad_transition" }),
    makeValidOutput({ transitionType: "continue_current_flow" }),
  );

  const result = await runTransitionEngine(session, "Hello", llm);

  assert.equal(result.isFallback, false);
  assert.equal(result.didRetry, true);
  assert.equal(result.output.transitionType, "continue_current_flow");
  assert.ok(result.trace.firstAttemptError);
});

test("engine retries when first output has missing fields", async () => {
  const session = createDefaultSessionState();
  const llm = mockLLMSequence(
    JSON.stringify({ shouldUpdateSession: true }),
    makeValidOutput(),
  );

  const result = await runTransitionEngine(session, "Hello", llm);

  assert.equal(result.isFallback, false);
  assert.equal(result.didRetry, true);
});

/* ═══════════════════════════════════════════════════════════════════════
   Engine Tests — Fallback on Double Failure
   ═══════════════════════════════════════════════════════════════════════ */

test("engine returns fallback when both attempts fail", async () => {
  const session = createDefaultSessionState();
  const llm = mockLLMSequence(
    "invalid json {{{",
    "still not valid json [[[",
  );

  const result = await runTransitionEngine(session, "Hello", llm);

  assert.equal(result.isFallback, true);
  assert.equal(result.didRetry, true);
  assert.equal(result.output.transitionType, "fallback");
  assert.equal(result.output.routeHint.source, "fallback");
  assert.equal(result.output.shouldUpdateSession, false);
  assert.ok(result.trace.firstAttemptError);
  assert.ok(result.trace.retryAttemptError);
});

test("engine fallback has safe defaults", async () => {
  const session = createDefaultSessionState();
  const llm = mockLLMSequence("bad1", "bad2");

  const result = await runTransitionEngine(session, "Hello", llm);

  assert.equal(result.isFallback, true);
  assert.deepEqual(result.output.sessionPatch, {});
  assert.equal(result.output.shouldUpdateSession, false);
  assert.equal(result.output.routeHint.confidence, 0.3);
  assert.ok(result.output.routeHint.contextualClues.length > 0);
});

/* ═══════════════════════════════════════════════════════════════════════
   Engine Tests — JSON Extraction from Markdown
   ═══════════════════════════════════════════════════════════════════════ */

test("engine extracts JSON from markdown code fences", async () => {
  const session = createDefaultSessionState();
  const valid = makeValidOutput({ transitionType: "deepen_current_flow" });
  const llm = mockLLM(`Here is the output:\n\`\`\`json\n${valid}\n\`\`\`\nHope this helps!`);

  const result = await runTransitionEngine(session, "Tell me more", llm);

  assert.equal(result.isFallback, false);
  assert.equal(result.output.transitionType, "deepen_current_flow");
});

/* ═══════════════════════════════════════════════════════════════════════
   Engine Tests — ExecuteTool / ToolCall Rejection
   ═══════════════════════════════════════════════════════════════════════ */

test("engine rejects output containing executeTool (via safety filter)", () => {
  const output = JSON.parse(makeValidOutput());
  output.routeHint.expectedIntents.push("executeTool: create_schedule");

  // Validate first — Zod pass but safety rejects
  const validatedResult = safeValidateTransitionOutput(output);
  assert.equal(validatedResult.success, false);
  assert.ok(validatedResult.error.includes("forbidden"));
});

test("engine rejects output containing toolCall (via safety filter)", () => {
  const output = JSON.parse(makeValidOutput());
  output.reason = "Make a toolCall to query schedule";

  const validatedResult = safeValidateTransitionOutput(output);
  assert.equal(validatedResult.success, false);
});

test("engine with LLM returning executeTool → retry then fallback", async () => {
  const session = createDefaultSessionState();
  const outputWithTool = makeValidOutput();
  // Inject forbidden token into expectedIntents
  const parsed = JSON.parse(outputWithTool);
  parsed.routeHint.expectedIntents.push("executeTool: create_plan");

  const llm = mockLLMSequence(
    JSON.stringify(parsed),
    JSON.stringify(parsed), // retry also fails with same content
  );

  const result = await runTransitionEngine(session, "Create a plan", llm);

  // Should fall back after both attempts rejected
  assert.equal(result.isFallback, true);
  assert.equal(result.output.routeHint.source, "fallback");
});

/* ═══════════════════════════════════════════════════════════════════════
   Post-hoc Safety Filter Tests
   ═══════════════════════════════════════════════════════════════════════ */

test("filterUnsafeOutput passes clean output through", () => {
  const clean = JSON.parse(makeValidOutput());
  const validated = transitionOutputSchema.parse(clean);
  const result = filterUnsafeOutput(validated);

  assert.equal(result.transitionType, "switch_domain");
  assert.equal(result.routeHint.source, "transition_engine");
});

test("filterUnsafeOutput replaces unsafe output with fallback", () => {
  const unsafe = JSON.parse(makeValidOutput());
  unsafe.routeHint.expectedIntents.push("runTool: delete_all");
  const validated = transitionOutputSchema.parse(unsafe);

  const result = filterUnsafeOutput(validated);

  assert.equal(result.transitionType, "fallback");
  assert.equal(result.routeHint.source, "fallback");
  assert.equal(result.shouldUpdateSession, false);
});

/* ═══════════════════════════════════════════════════════════════════════
   LLM output with surrounding text
   ═══════════════════════════════════════════════════════════════════════ */

test("engine extracts JSON from text with surrounding commentary", async () => {
  const session = createDefaultSessionState();
  const valid = makeValidOutput({ transitionType: "continue_current_flow" });
  const llm = mockLLM(
    `Based on the session state, I think the user is continuing.\n\n${valid}\n\nThis should work.`,
  );

  const result = await runTransitionEngine(session, "ok thanks", llm);

  assert.equal(result.isFallback, false);
  assert.equal(result.output.transitionType, "continue_current_flow");
});

/* ═══════════════════════════════════════════════════════════════════════
   No Real LLM Test
   ═══════════════════════════════════════════════════════════════════════ */

test("transition engine does not import real LLM client", async () => {
  const { readFileSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const source = readFileSync(
    resolve(process.cwd(), "src/lib/agent/session/transition-engine.ts"),
    "utf8",
  );

  // Must not import any real LLM client
  assert.doesNotMatch(source, /from.*openai|from.*anthropic|from.*complete-structured/i);
  // Must not import intent resolution
  assert.doesNotMatch(source, /resolveAgentIntent|arbitrateAgentIntent/i);
  // Must not import tool execution
  assert.doesNotMatch(source, /from.*executor|from.*tool-gate/i);
});
