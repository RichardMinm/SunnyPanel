import assert from "node:assert/strict";
import { test } from "node:test";

import {
  validateSlotExtractionOutput,
  ALLOWED_LLM_SLOT_KEYS,
  LLM_CANDIDATE_CONFIDENCE_THRESHOLD,
} from "../../../src/lib/agent/schedule/slot-extraction";
import type { ScheduleSlotExtractionInput } from "../../../src/lib/agent/schedule/slot-extraction";

const baseInput: ScheduleSlotExtractionInput = {
  currentDate: "2026-07-06",
  userMessage: "帮我把 SSTI 文章安排进这周日程，每天晚上 8 点到 10 点",
};

/* ──── Accept valid output ──── */

test("validate: accepts legal deadline=this_week", () => {
  const output = { confidence: 0.88, candidates: [{ key: "deadline", value: "this_week", confidence: 0.86, evidence: "本周内" }] };
  const result = validateSlotExtractionOutput(output, baseInput);
  assert.ok(result);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].key, "deadline");
});

test("validate: accepts legal availableTimeWindows", () => {
  const output = {
    confidence: 0.9,
    candidates: [{
      key: "availableTimeWindows",
      value: [
        { startTime: "20:00", endTime: "22:00", day: "每天" },
      ],
      confidence: 0.92,
      evidence: "每天晚上 8 点到 10 点",
    }],
  };
  const result = validateSlotExtractionOutput(output, baseInput);
  assert.ok(result);
  assert.equal(result.candidates.length, 1);
});

test("validate: accepts legal dailyCapacity as string", () => {
  const output = { confidence: 0.85, candidates: [{ key: "dailyCapacity", value: "每天 2 小时", confidence: 0.9, evidence: "每天 2 小时" }] };
  const result = validateSlotExtractionOutput(output, baseInput);
  assert.ok(result);
});

test("validate: accepts legal dailyCapacity as object with minutes", () => {
  const output = { confidence: 0.9, candidates: [{ key: "dailyCapacity", value: { minutes: 120, frequency: "daily" }, confidence: 0.9, evidence: "每天晚上 8 点到 10 点" }] };
  const result = validateSlotExtractionOutput(output, baseInput);
  assert.ok(result);
});

test("validate: accepts legal conflictPolicy=reschedule", () => {
  const output = { confidence: 0.88, candidates: [{ key: "conflictPolicy", value: "reschedule", confidence: 0.88, evidence: "有冲突就重新安排" }] };
  const result = validateSlotExtractionOutput(output, baseInput);
  assert.ok(result);
});

test("validate: accepts legal conflictPolicy=skip", () => {
  const output = { confidence: 0.85, candidates: [{ key: "conflictPolicy", value: "skip", confidence: 0.85, evidence: "冲突就跳过" }] };
  const result = validateSlotExtractionOutput(output, baseInput);
  assert.ok(result);
});

test("validate: accepts legal preferredTime", () => {
  const output = { confidence: 0.9, candidates: [{ key: "preferredTime", value: "晚上", confidence: 0.92, evidence: "晚上" }] };
  const result = validateSlotExtractionOutput(output, baseInput);
  assert.ok(result);
});

test("validate: accepts legal scheduleGranularity", () => {
  const output = { confidence: 0.8, candidates: [{ key: "scheduleGranularity", value: "time-block", confidence: 0.8 }] };
  const result = validateSlotExtractionOutput(output, baseInput);
  assert.ok(result);
});

test("validate: accepts legal availableDays as array", () => {
  const output = { confidence: 0.85, candidates: [{ key: "availableDays", value: ["周一", "周三", "周五"], confidence: 0.85 }] };
  const result = validateSlotExtractionOutput(output, baseInput);
  assert.ok(result);
});

/* ──── Reject invalid output ──── */

test("validate: rejects illegal key sourcePlanId", () => {
  const output = { confidence: 0.8, candidates: [{ key: "sourcePlanId", value: 1, confidence: 0.8 }] };
  assert.equal(validateSlotExtractionOutput(output, baseInput), null);
});

test("validate: rejects illegal key sourceChecklistId", () => {
  const output = { confidence: 0.8, candidates: [{ key: "sourceChecklistId", value: 1, confidence: 0.8 }] };
  assert.equal(validateSlotExtractionOutput(output, baseInput), null);
});

test("validate: rejects illegal key sourceType", () => {
  const output = { confidence: 0.8, candidates: [{ key: "sourceType", value: "plan", confidence: 0.8 }] };
  assert.equal(validateSlotExtractionOutput(output, baseInput), null);
});

test("validate: rejects forbidden term 'execute' in candidate", () => {
  const output = { confidence: 0.8, candidates: [{ key: "deadline", value: "execute now", confidence: 0.8 }] };
  assert.equal(validateSlotExtractionOutput(output, baseInput), null);
});

test("validate: rejects forbidden term 'write' in output", () => {
  const output = { confidence: 0.8, candidates: [{ key: "deadline", value: "this_week", confidence: 0.8 }], warnings: ["write needed"] };
  assert.equal(validateSlotExtractionOutput(output, baseInput), null);
});

test("validate: skips invalid time format — startTime >= endTime", () => {
  const output = {
    confidence: 0.8,
    candidates: [{
      key: "availableTimeWindows",
      value: [{ startTime: "22:00", endTime: "20:00" }],
      confidence: 0.8,
    }],
  };
  const result = validateSlotExtractionOutput(output, baseInput);
  // Bad candidate is skipped, output still returned with empty candidates
  assert.ok(result);
  assert.equal(result.candidates.length, 0);
  assert.ok(result.warnings && result.warnings.length > 0);
});

test("validate: skips invalid time format — not HH:mm", () => {
  const output = {
    confidence: 0.8,
    candidates: [{
      key: "availableTimeWindows",
      value: [{ startTime: "8pm", endTime: "10pm" }],
      confidence: 0.8,
    }],
  };
  const result = validateSlotExtractionOutput(output, baseInput);
  assert.ok(result);
  assert.equal(result.candidates.length, 0);
});

test("validate: skips invalid conflictPolicy value", () => {
  const output = { confidence: 0.8, candidates: [{ key: "conflictPolicy", value: "ignore", confidence: 0.8 }] };
  const result = validateSlotExtractionOutput(output, baseInput);
  assert.ok(result);
  assert.equal(result.candidates.length, 0);
});

test("validate: skips candidate with confidence outside [0,1]", () => {
  const badCandidate = { confidence: 0.8, candidates: [{ key: "deadline", value: "this_week", confidence: 1.5 }] };
  const result = validateSlotExtractionOutput(badCandidate, baseInput);
  assert.ok(result);
  assert.equal(result.candidates.length, 0);
});

test("validate: skips duration outside [15, 720] — too small", () => {
  const output = { confidence: 0.8, candidates: [{ key: "dailyCapacity", value: { minutes: 5 }, confidence: 0.8 }] };
  const result = validateSlotExtractionOutput(output, baseInput);
  assert.ok(result);
  assert.equal(result.candidates.length, 0);
});

test("validate: skips duration outside [15, 720] — too large", () => {
  const output = { confidence: 0.8, candidates: [{ key: "dailyCapacity", value: { minutes: 800 }, confidence: 0.8 }] };
  const result = validateSlotExtractionOutput(output, baseInput);
  assert.ok(result);
  assert.equal(result.candidates.length, 0);
});

test("validate: rejects non-object input", () => {
  assert.equal(validateSlotExtractionOutput(null, baseInput), null);
  assert.equal(validateSlotExtractionOutput("string", baseInput), null);
  assert.equal(validateSlotExtractionOutput(42, baseInput), null);
});

test("validate: rejects missing candidates array", () => {
  assert.equal(validateSlotExtractionOutput({ confidence: 0.5 }, baseInput), null);
});

test("validate: skips invalid deadline value", () => {
  const output = { confidence: 0.8, candidates: [{ key: "deadline", value: "invalid_deadline", confidence: 0.8 }] };
  const result = validateSlotExtractionOutput(output, baseInput);
  assert.ok(result);
  assert.equal(result.candidates.length, 0);
});

test("validate: accepts deadline as YYYY-MM-DD", () => {
  const output = { confidence: 0.9, candidates: [{ key: "deadline", value: "2026-07-15", confidence: 0.9, evidence: "7月15日" }] };
  const result = validateSlotExtractionOutput(output, baseInput);
  assert.ok(result);
});

test("validate: accepts deadline as today", () => {
  const output = { confidence: 0.85, candidates: [{ key: "deadline", value: "today", confidence: 0.85 }] };
  const result = validateSlotExtractionOutput(output, baseInput);
  assert.ok(result);
});
