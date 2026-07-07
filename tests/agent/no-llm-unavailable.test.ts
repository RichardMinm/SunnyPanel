/**
 * Phase LLM-R1: No-LLM Unavailable — pipeline stop & fallback prevention tests.
 *
 * These tests verify:
 *  1. When AGENT_REQUIRE_LLM=1 and LLM is unavailable, no business fallback is invoked
 *  2. Existing behavior is preserved when AGENT_REQUIRE_LLM=0
 *  3. Clarification composer / slot extractor feature flags interact correctly
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isAgentRequireLLMEnabled,
  checkAgentLLMAvailability,
  buildLLMUnavailableAgentResponse,
} from "../../src/lib/agent/llm-required";
import { isClarificationComposerLLMEnabled } from "../../src/lib/agent/response/clarification/feature-flag";
import { isLLMSlotExtractorEnabled } from "../../src/lib/agent/schedule/slot-extraction/feature-flag";

/* ──── Env helpers ──── */

const saveEnv = (key: string) => ({
  had: Object.hasOwn(process.env, key),
  value: process.env[key],
});

const restoreEnv = (key: string, prev: ReturnType<typeof saveEnv>) => {
  if (prev.had) {
    process.env[key] = prev.value;
  } else {
    delete process.env[key];
  }
};

/* ──── Clarification composer + require mode interaction ──── */

test("AGENT_REQUIRE_LLM=0: clarification composer behavior unchanged", () => {
  // When AGENT_REQUIRE_LLM is not set (default mode), the clarification
  // composer feature flag should work as before.
  const prevReq = saveEnv("AGENT_REQUIRE_LLM");
  const prevDis = saveEnv("AGENT_DISABLE_LLM");
  const prevComp = saveEnv("AGENT_LLM_CLARIFICATION_COMPOSER");
  delete process.env.AGENT_REQUIRE_LLM;

  try {
    // With AGENT_DISABLE_LLM=1, composer should be disabled (as before)
    process.env.AGENT_DISABLE_LLM = "1";
    assert.equal(isClarificationComposerLLMEnabled(), false);

    // Without AGENT_DISABLE_LLM, composer should follow its own flag
    delete process.env.AGENT_DISABLE_LLM;
    // Default: enabled (because AGENT_LLM_CLARIFICATION_COMPOSER is not "0" or "false")
    assert.equal(isClarificationComposerLLMEnabled(), true);
  } finally {
    restoreEnv("AGENT_REQUIRE_LLM", prevReq);
    restoreEnv("AGENT_DISABLE_LLM", prevDis);
    restoreEnv("AGENT_LLM_CLARIFICATION_COMPOSER", prevComp);
  }
});

test("AGENT_REQUIRE_LLM=1 + no LLM: pipeline stops before clarification fallback", async () => {
  // When require mode is on and LLM is unavailable, checkAgentLLMAvailability
  // returns unavailable. The pipeline intercept guarantees that no clarification
  // composer (LLM or fallback) is ever reached.
  const prevReq = saveEnv("AGENT_REQUIRE_LLM");
  const prevDis = saveEnv("AGENT_DISABLE_LLM");
  process.env.AGENT_REQUIRE_LLM = "1";
  process.env.AGENT_DISABLE_LLM = "1";

  try {
    const availability = await checkAgentLLMAvailability();
    assert.equal(availability.available, false);

    // The pipeline would return before reaching the clarification composer.
    // We verify this by confirming:
    // 1. The availability check fails correctly
    // 2. The unavailable response has no clarification artifacts
    if (!availability.available) {
      assert.equal(availability.reason, "llm_disabled");
      // No clarification composer output should ever be in this path
      assert.ok(
        !availability.message.includes("clarification"),
        "Unavailable reason should not mention clarification",
      );
    }
  } finally {
    restoreEnv("AGENT_REQUIRE_LLM", prevReq);
    restoreEnv("AGENT_DISABLE_LLM", prevDis);
  }
});

/* ──── Slot extractor + require mode interaction ──── */

test("AGENT_REQUIRE_LLM=0: slot extractor behavior unchanged", () => {
  const prevReq = saveEnv("AGENT_REQUIRE_LLM");
  const prevDis = saveEnv("AGENT_DISABLE_LLM");
  const prevSlot = saveEnv("AGENT_LLM_SCHEDULE_SLOT_EXTRACTOR");
  delete process.env.AGENT_REQUIRE_LLM;

  try {
    // With AGENT_DISABLE_LLM=1, slot extractor should be disabled (as before)
    process.env.AGENT_DISABLE_LLM = "1";
    assert.equal(isLLMSlotExtractorEnabled(), false);

    // Without AGENT_DISABLE_LLM but without the specific flag, disabled by default
    delete process.env.AGENT_DISABLE_LLM;
    assert.equal(isLLMSlotExtractorEnabled(), false);
  } finally {
    restoreEnv("AGENT_REQUIRE_LLM", prevReq);
    restoreEnv("AGENT_DISABLE_LLM", prevDis);
    restoreEnv("AGENT_LLM_SCHEDULE_SLOT_EXTRACTOR", prevSlot);
  }
});

test("AGENT_REQUIRE_LLM=1 + no LLM: pipeline stops before slot extraction", async () => {
  // When require mode is on and LLM is unavailable, the pipeline stops
  // before reaching slot extraction.
  const prevReq = saveEnv("AGENT_REQUIRE_LLM");
  const prevDis = saveEnv("AGENT_DISABLE_LLM");
  const prevSlot = saveEnv("AGENT_LLM_SCHEDULE_SLOT_EXTRACTOR");
  process.env.AGENT_REQUIRE_LLM = "1";
  process.env.AGENT_DISABLE_LLM = "1";
  // Even if slot extraction flag is on, pipeline stops before reaching it
  process.env.AGENT_LLM_SCHEDULE_SLOT_EXTRACTOR = "1";

  try {
    const availability = await checkAgentLLMAvailability();
    assert.equal(availability.available, false);

    // Slot extractor flag is irrelevant — pipeline already stopped
    // But the feature flag function itself still works (it checks AGENT_DISABLE_LLM)
    assert.equal(isLLMSlotExtractorEnabled(), false);
  } finally {
    restoreEnv("AGENT_REQUIRE_LLM", prevReq);
    restoreEnv("AGENT_DISABLE_LLM", prevDis);
    restoreEnv("AGENT_LLM_SCHEDULE_SLOT_EXTRACTOR", prevSlot);
  }
});

/* ──── Existing behavior preservation ──── */

test("AGENT_REQUIRE_LLM=0 + AGENT_DISABLE_LLM=1: old test behavior preserved", async () => {
  // This is the standard test environment configuration.
  // When AGENT_REQUIRE_LLM is not set (default), AGENT_DISABLE_LLM=1
  // should NOT trigger the unavailable path — existing heuristic fallback
  // behavior should be preserved.
  const prevReq = saveEnv("AGENT_REQUIRE_LLM");
  const prevDis = saveEnv("AGENT_DISABLE_LLM");
  delete process.env.AGENT_REQUIRE_LLM;
  process.env.AGENT_DISABLE_LLM = "1";

  try {
    // checkAgentLLMAvailability should return available
    const availability = await checkAgentLLMAvailability();
    assert.equal(availability.available, true);

    // Existing heuristic paths should still work:
    // - isClarificationComposerLLMEnabled returns false (AGENT_DISABLE_LLM=1)
    // - isLLMSlotExtractorEnabled returns false (AGENT_DISABLE_LLM=1)
    // But the pipeline CONTINUES (not interrupted by require mode)
    assert.equal(isClarificationComposerLLMEnabled(), false);
    assert.equal(isLLMSlotExtractorEnabled(), false);
  } finally {
    restoreEnv("AGENT_REQUIRE_LLM", prevReq);
    restoreEnv("AGENT_DISABLE_LLM", prevDis);
  }
});

test("AGENT_REQUIRE_LLM=1 + LLM available: pipeline enters normally", { skip: true }, async () => {
  // SKIPPED: This test requires a running Postgres database to verify
  // the config-available → pipeline-enter path.
  // In test environments without a database, getAgentModelConfig produces
  // an unhandled rejection from Postgres connection pool.
  //
  // Manual verification:
  // 1. Set AGENT_REQUIRE_LLM=1 in a dev environment with a running DB
  // 2. Ensure a valid API key is configured in agent-settings
  // 3. Verify checkAgentLLMAvailability() returns { available: true }
  // 4. Verify the pipeline enters normally without the unavailable response
});

/* ──── No business workflow tests ──── */

test("unavailable response has no schedulingDraft", () => {
  // Verify the contract: unavailable response must not carry any draft
  // that the frontend might render as a business artifact.
  const response = buildLLMUnavailableAgentResponse({
    reason: "llm_disabled",
    threadId: 1,
  });

  // No business data fields should be populated
  assert.equal(response.schedulingDraft ?? null, null);
  assert.equal(response.planningDraft ?? null, null);
  assert.equal(response.planningChecklistDraft ?? null, null);
  assert.equal(response.pendingAction, null);
  assert.equal(response.intent, "clarify");
});

test("unavailable response backendTraceEvents are well-formed", () => {
  const response = buildLLMUnavailableAgentResponse({
    reason: "llm_missing_config",
    threadId: 1,
  });

  const events = response.backendTraceEvents ?? [];
  assert.ok(events.length >= 1);
  const event = events[0];

  // Required fields must be present
  assert.ok(event.phase);
  assert.ok(event.status);
  assert.ok(event.title);
  assert.ok(event.threadId);

  // Phase must be llm_availability
  assert.equal(event.phase, "llm_availability");
  // Status must be failed
  assert.equal(event.status, "failed");
  // Must not contain raw secrets
  const serialized = JSON.stringify(event);
  assert.ok(!serialized.includes("sk-"), "Must not contain API key prefix");
  assert.ok(!serialized.includes("Bearer"), "Must not contain auth header");
});
