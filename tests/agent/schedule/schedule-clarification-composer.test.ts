import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildScheduleClarificationContext,
  composeClarificationFallback,
} from "../../../src/lib/agent/response/clarification";

/* ──── Schedule Context Builder ──── */

test("schedule context: maps missingSlotKeys to human labels", () => {
  const context = buildScheduleClarificationContext({
    missingSlotKeys: ["dailyCapacity", "preferredTime", "conflictPolicy"],
    userMessage: "帮我把文章安排进日程",
  });

  assert.ok(context.missingNeeds.length > 0);
  assert.ok(context.workflow === "schedule_creation");

  const labels = context.missingNeeds.map((n) => n.label);
  assert.ok(labels.some((l) => l.includes("投入时间") || l.includes("可投入")));
  assert.ok(labels.some((l) => l.includes("偏好") || l.includes("时间段")));
  assert.ok(labels.some((l) => l.includes("冲突") || l.includes("处理")));
});

test("schedule context: maxQuestions is 3", () => {
  const context = buildScheduleClarificationContext({
    missingSlotKeys: ["dailyCapacity", "preferredTime", "conflictPolicy"],
    userMessage: "安排日程",
  });
  assert.equal(context.maxQuestions, 3);
});

test("schedule context: knownFacts include source and deadline in natural language", () => {
  const context = buildScheduleClarificationContext({
    deadline: "本周内",
    missingSlotKeys: ["dailyCapacity"],
    sourceLabel: "当前计划",
    userMessage: "安排日程",
  });
  assert.ok(context.knownFacts.some((f) => f.includes("当前计划")));
  assert.ok(context.knownFacts.some((f) => f.includes("本周内")));
});

test("schedule context: safetyBoundary says willNotWriteYet", () => {
  const context = buildScheduleClarificationContext({
    missingSlotKeys: ["dailyCapacity"],
    userMessage: "安排日程",
  });
  assert.equal(context.safetyBoundary.willNotWriteYet, true);
  assert.ok(context.safetyBoundary.nextStep.includes("草案"));
});

/* ──── Schedule Fallback Composer ──── */

test("schedule fallback: never exposes sourceType", () => {
  const context = buildScheduleClarificationContext({
    missingSlotKeys: ["dailyCapacity", "preferredTime", "conflictPolicy"],
    sourceLabel: "当前计划",
    userMessage: "帮我把 SSTI 文章安排进这周日程",
  });
  const output = composeClarificationFallback(context);
  assert.doesNotMatch(output.message, /sourceType/);
});

test("schedule fallback: never exposes missingSlots", () => {
  const context = buildScheduleClarificationContext({
    missingSlotKeys: ["dailyCapacity", "preferredTime"],
    userMessage: "安排日程",
  });
  const output = composeClarificationFallback(context);
  assert.doesNotMatch(output.message, /missingSlots/);
});

test("schedule fallback: never exposes internal field keys", () => {
  const context = buildScheduleClarificationContext({
    missingSlotKeys: [
      "dailyCapacity",
      "preferredTime",
      "conflictPolicy",
      "availableTimeWindows",
      "priorityRule",
    ],
    userMessage: "安排日程",
  });
  const output = composeClarificationFallback(context);
  assert.doesNotMatch(output.message, /conflictPolicy/);
  assert.doesNotMatch(output.message, /priorityRule/);
  assert.doesNotMatch(output.message, /availableTimeWindows/);
  assert.doesNotMatch(output.message, /dailyCapacity/);
});

test("schedule fallback: explicitly says will not write to schedule yet", () => {
  const context = buildScheduleClarificationContext({
    missingSlotKeys: ["dailyCapacity"],
    userMessage: "安排日程",
  });
  const output = composeClarificationFallback(context);
  assert.match(output.message, /不直接写入日程|暂时不会写入日程/);
});

test("schedule fallback: explicitly says next step generates schedule draft", () => {
  const context = buildScheduleClarificationContext({
    missingSlotKeys: ["dailyCapacity"],
    userMessage: "安排日程",
  });
  const output = composeClarificationFallback(context);
  assert.match(output.message, /先生成.*草案/);
});

test("schedule fallback: max 3 core questions", () => {
  const context = buildScheduleClarificationContext({
    missingSlotKeys: [
      "dailyCapacity",
      "preferredTime",
      "conflictPolicy",
      "availableTimeWindows",
      "priorityRule",
      "deadline",
    ],
    userMessage: "安排日程",
  });
  const output = composeClarificationFallback(context);
  assert.ok(output.questions.length <= 3);
});

test("schedule fallback: includes suggestedReply", () => {
  const context = buildScheduleClarificationContext({
    missingSlotKeys: ["dailyCapacity", "preferredTime"],
    userMessage: "安排日程",
  });
  const output = composeClarificationFallback(context);
  assert.ok(output.suggestedReply);
  assert.ok(output.suggestedReply.length > 0);
});

test("schedule fallback: safetyNote mentions not writing", () => {
  const context = buildScheduleClarificationContext({
    missingSlotKeys: ["dailyCapacity"],
    userMessage: "安排日程",
  });
  const output = composeClarificationFallback(context);
  assert.match(output.safetyNote, /暂时不会写入|不直接写入/);
});

test("schedule fallback: source is fallback", () => {
  const context = buildScheduleClarificationContext({
    missingSlotKeys: ["dailyCapacity"],
    userMessage: "安排日程",
  });
  const output = composeClarificationFallback(context);
  assert.equal(output.source, "fallback");
});
