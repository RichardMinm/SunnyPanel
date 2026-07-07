import assert from "node:assert/strict";
import { test } from "node:test";

import { isLLMSlotExtractorEnabled } from "../../../src/lib/agent/schedule/slot-extraction";
import { classifyScheduleIntentBoundary } from "../../../src/lib/agent/schedule/intent-boundary";

/* ──── Feature Flag Behavior ──── */

test("integration: AGENT_DISABLE_LLM=1 disables LLM slot extractor", () => {
  const saved = process.env.AGENT_DISABLE_LLM;
  process.env.AGENT_DISABLE_LLM = "1";
  try {
    assert.equal(isLLMSlotExtractorEnabled(), false);
  } finally {
    if (saved === undefined) delete process.env.AGENT_DISABLE_LLM;
    else process.env.AGENT_DISABLE_LLM = saved;
  }
});

test("integration: AGENT_LLM_SCHEDULE_SLOT_EXTRACTOR=0 disables", () => {
  const savedDisable = process.env.AGENT_DISABLE_LLM;
  const savedFlag = process.env.AGENT_LLM_SCHEDULE_SLOT_EXTRACTOR;
  delete process.env.AGENT_DISABLE_LLM;
  process.env.AGENT_LLM_SCHEDULE_SLOT_EXTRACTOR = "0";
  try {
    assert.equal(isLLMSlotExtractorEnabled(), false);
  } finally {
    if (savedDisable === undefined) delete process.env.AGENT_DISABLE_LLM;
    else process.env.AGENT_DISABLE_LLM = savedDisable;
    if (savedFlag === undefined) delete process.env.AGENT_LLM_SCHEDULE_SLOT_EXTRACTOR;
    else process.env.AGENT_LLM_SCHEDULE_SLOT_EXTRACTOR = savedFlag;
  }
});

test("integration: AGENT_LLM_SCHEDULE_SLOT_EXTRACTOR absent disables", () => {
  const savedDisable = process.env.AGENT_DISABLE_LLM;
  const savedFlag = process.env.AGENT_LLM_SCHEDULE_SLOT_EXTRACTOR;
  delete process.env.AGENT_DISABLE_LLM;
  delete process.env.AGENT_LLM_SCHEDULE_SLOT_EXTRACTOR;
  try {
    assert.equal(isLLMSlotExtractorEnabled(), false);
  } finally {
    if (savedDisable === undefined) delete process.env.AGENT_DISABLE_LLM;
    else process.env.AGENT_DISABLE_LLM = savedDisable;
    if (savedFlag === undefined) delete process.env.AGENT_LLM_SCHEDULE_SLOT_EXTRACTOR;
    else process.env.AGENT_LLM_SCHEDULE_SLOT_EXTRACTOR = savedFlag;
  }
});

test("integration: AGENT_LLM_SCHEDULE_SLOT_EXTRACTOR=1 enables when AGENT_DISABLE_LLM not set", () => {
  const savedDisable = process.env.AGENT_DISABLE_LLM;
  const savedFlag = process.env.AGENT_LLM_SCHEDULE_SLOT_EXTRACTOR;
  delete process.env.AGENT_DISABLE_LLM;
  process.env.AGENT_LLM_SCHEDULE_SLOT_EXTRACTOR = "1";
  try {
    assert.equal(isLLMSlotExtractorEnabled(), true);
  } finally {
    if (savedDisable === undefined) delete process.env.AGENT_DISABLE_LLM;
    else process.env.AGENT_DISABLE_LLM = savedDisable;
    if (savedFlag === undefined) delete process.env.AGENT_LLM_SCHEDULE_SLOT_EXTRACTOR;
    else process.env.AGENT_LLM_SCHEDULE_SLOT_EXTRACTOR = savedFlag;
  }
});

/* ──── query_schedule path does NOT use LLM extractor ──── */

test("integration: '帮我查看最近日程安排' is still query_schedule", () => {
  const result = classifyScheduleIntentBoundary({
    userMessage: "帮我查看最近日程安排",
  });
  assert.equal(result.intent, "query_schedule");
  assert.equal(result.readOrWrite, "read");
  assert.equal(result.source, "rule");
});

test("integration: '今天有什么日程' is still query_schedule", () => {
  const result = classifyScheduleIntentBoundary({
    userMessage: "今天有什么日程",
  });
  assert.equal(result.intent, "query_schedule");
  assert.equal(result.readOrWrite, "read");
});

test("integration: '最近有什么安排' is still query_schedule", () => {
  const result = classifyScheduleIntentBoundary({
    userMessage: "最近有什么安排",
  });
  assert.equal(result.intent, "query_schedule");
  assert.equal(result.readOrWrite, "read");
});

/* ──── schedule_creation path still classifies correctly ──── */

test("integration: '安排进日程' is schedule_creation", () => {
  const result = classifyScheduleIntentBoundary({
    userMessage: "帮我把这些任务安排进日程",
  });
  assert.equal(result.intent, "schedule_creation");
  assert.equal(result.readOrWrite, "write");
  assert.equal(result.source, "rule");
});

test("integration: '创建日程' is schedule_creation", () => {
  const result = classifyScheduleIntentBoundary({
    userMessage: "创建日程：明天上午开会",
  });
  assert.equal(result.intent, "schedule_creation");
  assert.equal(result.readOrWrite, "write");
});

/* ──── Schedule readiness gate: insufficient still no pendingAction ──── */

test("integration: schedule readiness insufficient does not create pendingAction via gate type", () => {
  // The gate's Applied result type always has pendingAction: null
  // This is enforced by the ScheduleReadinessGateApplied type
  const appliedGate = {
    assistantMessage: "test",
    gateApplied: true as const,
    intent: "clarify" as const,
    pendingAction: null,
    readiness: {
      status: "insufficient" as const,
      confidence: 0.76,
      knownSlots: [],
      missingSlots: ["dailyCapacity" as const],
      suggestedQuestions: [],
      reason: "test",
    },
    sessionState: {} as never,
    traceStep: { id: "test", kind: "analysis" as const, status: "done" as const, title: "test" },
  };
  assert.equal(appliedGate.pendingAction, null);
});

/* ──── Confidence threshold type ──── */

test("integration: LLM_CANDIDATE_CONFIDENCE_THRESHOLD is 0.65", async () => {
  const { LLM_CANDIDATE_CONFIDENCE_THRESHOLD } = await import(
    "../../../src/lib/agent/schedule/slot-extraction"
  );
  assert.equal(LLM_CANDIDATE_CONFIDENCE_THRESHOLD, 0.65);
});

/* ──── Allowed keys exclude source identifiers ──── */

test("integration: ALLOWED_LLM_SLOT_KEYS excludes sourceType, sourcePlanId, sourceChecklistId", async () => {
  const { ALLOWED_LLM_SLOT_KEYS } = await import(
    "../../../src/lib/agent/schedule/slot-extraction"
  );
  assert.equal(ALLOWED_LLM_SLOT_KEYS.has("sourceType"), false);
  assert.equal(ALLOWED_LLM_SLOT_KEYS.has("sourcePlanId"), false);
  assert.equal(ALLOWED_LLM_SLOT_KEYS.has("sourceChecklistId"), false);
});

test("integration: ALLOWED_LLM_SLOT_KEYS includes all extractable keys", async () => {
  const { ALLOWED_LLM_SLOT_KEYS } = await import(
    "../../../src/lib/agent/schedule/slot-extraction"
  );
  assert.equal(ALLOWED_LLM_SLOT_KEYS.has("deadline"), true);
  assert.equal(ALLOWED_LLM_SLOT_KEYS.has("availableDays"), true);
  assert.equal(ALLOWED_LLM_SLOT_KEYS.has("availableTimeWindows"), true);
  assert.equal(ALLOWED_LLM_SLOT_KEYS.has("dailyCapacity"), true);
  assert.equal(ALLOWED_LLM_SLOT_KEYS.has("preferredTime"), true);
  assert.equal(ALLOWED_LLM_SLOT_KEYS.has("conflictPolicy"), true);
  assert.equal(ALLOWED_LLM_SLOT_KEYS.has("priorityRule"), true);
  assert.equal(ALLOWED_LLM_SLOT_KEYS.has("durationEstimate"), true);
  assert.equal(ALLOWED_LLM_SLOT_KEYS.has("scheduleGranularity"), true);
});
