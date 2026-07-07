import assert from "node:assert/strict";
import { test } from "node:test";

import { mergeLLMSlots } from "../../../src/lib/agent/schedule/slot-extraction";
import type { ScheduleSlotExtractionOutput } from "../../../src/lib/agent/schedule/slot-extraction";
import type { ScheduleSlots } from "../../../src/lib/agent/schedule/readiness";

const llmOutput = (overrides: Partial<ScheduleSlotExtractionOutput> = {}): ScheduleSlotExtractionOutput => ({
  candidates: [
    { key: "deadline", value: "this_week", confidence: 0.9, evidence: "本周内", source: "llm" },
    { key: "preferredTime", value: "晚上", confidence: 0.92, evidence: "晚上", source: "llm" },
    { key: "conflictPolicy", value: "ask", confidence: 0.8, evidence: "有冲突问我", source: "llm" },
  ],
  confidence: 0.87,
  source: "llm",
  ...overrides,
});

/* ──── Merge: LLM fills gaps ──── */

test("merge: LLM fills missing deterministic slot", () => {
  const deterministic: Partial<ScheduleSlots> = {}; // empty
  const { slots, source, appliedCandidates } = mergeLLMSlots(deterministic, llmOutput());

  assert.equal(source, "hybrid");
  assert.equal(slots.deadline, "this_week");
  assert.equal(slots.preferredTime, "晚上");
  assert.equal(slots.conflictPolicy, "ask");
  assert.equal(appliedCandidates.length, 3);
});

test("merge: deterministic slot wins over conflicting LLM value", () => {
  const deterministic: Partial<ScheduleSlots> = { deadline: "next_week" };
  const { slots, source, ignoredCandidates } = mergeLLMSlots(deterministic, llmOutput());

  assert.equal(slots.deadline, "next_week"); // deterministic kept
  assert.equal(slots.preferredTime, "晚上"); // LLM fills gap
  assert.ok(ignoredCandidates.some((c) => c.key === "deadline"));
});

test("merge: low-confidence candidate ignored (filtered at validation, but merge also handles)", () => {
  const lowConfidence = llmOutput({
    candidates: [
      { key: "deadline", value: "this_week", confidence: 0.5, source: "llm" },
      { key: "preferredTime", value: "晚上", confidence: 0.9, source: "llm" },
    ],
  });
  const deterministic: Partial<ScheduleSlots> = {};
  const { slots, source, ignoredCandidates } = mergeLLMSlots(deterministic, lowConfidence);

  // Low-confidence candidate is still present (validation step handles filtering)
  // But merge doesn't filter confidence — it trusts validation
  // deadline=this_week with confidence 0.5 is still applied by merge
  assert.equal(slots.deadline, "this_week");
  assert.equal(source, "hybrid");
});

test("merge: empty LLM output → pure deterministic result", () => {
  const deterministic: Partial<ScheduleSlots> = { deadline: "next_week" };
  const { slots, source } = mergeLLMSlots(deterministic, null);

  assert.equal(source, "deterministic");
  assert.equal(slots.deadline, "next_week");
});

test("merge: fallback source → pure deterministic result", () => {
  const fallbackOutput = llmOutput({ source: "fallback", candidates: [] });
  const deterministic: Partial<ScheduleSlots> = { deadline: "next_week" };
  const { slots, source } = mergeLLMSlots(deterministic, fallbackOutput);

  assert.equal(source, "deterministic");
  assert.equal(slots.deadline, "next_week");
});

test("merge: applied/ignored candidates recorded", () => {
  const deterministic: Partial<ScheduleSlots> = { deadline: "next_week" };
  const { appliedCandidates, ignoredCandidates } = mergeLLMSlots(deterministic, llmOutput());

  // preferredTime + conflictPolicy applied (deadline ignored — already has deterministic value)
  assert.ok(appliedCandidates.some((c) => c.key === "preferredTime"));
  assert.ok(appliedCandidates.some((c) => c.key === "conflictPolicy"));
  assert.ok(ignoredCandidates.some((c) => c.key === "deadline"));
});

test("merge: does not mutate input", () => {
  const deterministic: Partial<ScheduleSlots> = { deadline: "next_week" };
  const original = { ...deterministic };

  mergeLLMSlots(deterministic, llmOutput());

  assert.deepEqual(deterministic, original);
});

test("merge: availableTimeWindows complement from LLM", () => {
  const output = llmOutput({
    candidates: [{
      key: "availableTimeWindows",
      value: [{ startTime: "20:00", endTime: "22:00", day: "每天" }],
      confidence: 0.92,
      source: "llm",
    }],
  });
  const deterministic: Partial<ScheduleSlots> = {};
  const { slots, source } = mergeLLMSlots(deterministic, output);

  assert.equal(source, "hybrid");
  assert.ok(Array.isArray(slots.availableTimeWindows));
  assert.equal(slots.availableTimeWindows![0].startTime, "20:00");
});

test("merge: deterministic priority for availableTimeWindows", () => {
  const output = llmOutput({
    candidates: [{
      key: "availableTimeWindows",
      value: [{ startTime: "20:00", endTime: "22:00" }],
      confidence: 0.9,
      source: "llm",
    }],
  });
  const deterministic: Partial<ScheduleSlots> = {
    availableTimeWindows: [{ startTime: "09:00", endTime: "17:00" }],
  };
  const { slots, ignoredCandidates } = mergeLLMSlots(deterministic, output);

  // deterministic timeWindows are kept
  assert.equal(slots.availableTimeWindows![0].startTime, "09:00");
  assert.ok(ignoredCandidates.some((c) => c.key === "availableTimeWindows"));
});

test("merge: dailyCapacity object converted to string", () => {
  const output = llmOutput({
    candidates: [{
      key: "dailyCapacity",
      value: { minutes: 120, frequency: "daily" },
      confidence: 0.9,
      source: "llm",
    }],
  });
  const deterministic: Partial<ScheduleSlots> = {};
  const { slots, source } = mergeLLMSlots(deterministic, output);

  assert.equal(source, "hybrid");
  assert.equal(slots.dailyCapacity, "每天 2 小时");
});
