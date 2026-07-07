import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildPlanningClarificationContext,
  composeClarificationFallback,
} from "../../../src/lib/agent/response/clarification";

/* ──── Planning Context Builder ──── */

test("planning context: maps missingSlotKeys to human labels", () => {
  const context = buildPlanningClarificationContext({
    missingSlotKeys: ["availableTime", "scope", "currentProgress", "successCriteria"],
    userMessage: "帮我制定考研复习计划",
  });

  assert.ok(context.missingNeeds.length > 0);
  assert.ok(context.workflow === "plan_creation");

  const labels = context.missingNeeds.map((n) => n.label);
  assert.ok(labels.some((l) => l.includes("投入时间")));
  assert.ok(labels.some((l) => l.includes("范围")));
  assert.ok(labels.some((l) => l.includes("进度")));
  assert.ok(labels.some((l) => l.includes("标准") || l.includes("成功")));
});

test("planning context: maxQuestions is 4", () => {
  const context = buildPlanningClarificationContext({
    missingSlotKeys: ["availableTime", "scope", "currentProgress", "successCriteria"],
    userMessage: "制定计划",
  });
  assert.equal(context.maxQuestions, 4);
});

test("planning context: knownFacts include goal and deadline in natural language", () => {
  const context = buildPlanningClarificationContext({
    deadline: "6月底",
    goal: "完成考研数学复习",
    missingSlotKeys: ["availableTime"],
    userMessage: "制定考研复习计划",
  });
  assert.ok(context.knownFacts.some((f) => f.includes("考研")));
  assert.ok(context.knownFacts.some((f) => f.includes("6月底")));
});

test("planning context: safetyBoundary says willNotWriteYet", () => {
  const context = buildPlanningClarificationContext({
    missingSlotKeys: ["availableTime"],
    userMessage: "制定计划",
  });
  assert.equal(context.safetyBoundary.willNotWriteYet, true);
  assert.ok(context.safetyBoundary.nextStep.includes("草案"));
});

/* ──── Planning Fallback Composer ──── */

test("planning fallback: never exposes raw field names", () => {
  const context = buildPlanningClarificationContext({
    goal: "完成项目上线",
    missingSlotKeys: [
      "availableTime",
      "scope",
      "currentProgress",
      "successCriteria",
      "constraints",
      "deliverables",
      "priority",
    ],
    userMessage: "帮我制定上线计划",
  });
  const output = composeClarificationFallback(context);
  assert.doesNotMatch(output.message, /currentProgress/);
  assert.doesNotMatch(output.message, /successCriteria/);
  assert.doesNotMatch(output.message, /deliverables/);
  assert.doesNotMatch(output.message, /constraints/);
});

test("planning fallback: never exposes goal as field key", () => {
  const context = buildPlanningClarificationContext({
    goal: "完成项目",
    missingSlotKeys: ["availableTime"],
    userMessage: "制定计划",
  });
  const output = composeClarificationFallback(context);
  // "目标" as a natural word is okay, but not "goal" as a field name
  assert.doesNotMatch(output.message, /"goal"/);
});

test("planning fallback: explicitly says will not create plan yet", () => {
  const context = buildPlanningClarificationContext({
    missingSlotKeys: ["availableTime"],
    userMessage: "制定计划",
  });
  const output = composeClarificationFallback(context);
  assert.match(output.message, /不直接写入计划|暂时不会写入计划|不直接创建计划/);
});

test("planning fallback: explicitly says next step generates plan draft", () => {
  const context = buildPlanningClarificationContext({
    missingSlotKeys: ["availableTime"],
    userMessage: "制定计划",
  });
  const output = composeClarificationFallback(context);
  assert.match(output.message, /先生成.*草案/);
});

test("planning fallback: max 4 core questions", () => {
  const context = buildPlanningClarificationContext({
    missingSlotKeys: [
      "availableTime",
      "scope",
      "currentProgress",
      "successCriteria",
      "constraints",
      "priority",
    ],
    userMessage: "制定计划",
  });
  const output = composeClarificationFallback(context);
  assert.ok(output.questions.length <= 4);
});

test("planning fallback: includes suggestedReply", () => {
  const context = buildPlanningClarificationContext({
    missingSlotKeys: ["availableTime", "scope"],
    userMessage: "制定计划",
  });
  const output = composeClarificationFallback(context);
  assert.ok(output.suggestedReply);
  assert.ok(output.suggestedReply.length > 0);
});

test("planning fallback: safetyNote mentions not writing", () => {
  const context = buildPlanningClarificationContext({
    missingSlotKeys: ["availableTime"],
    userMessage: "制定计划",
  });
  const output = composeClarificationFallback(context);
  assert.match(output.safetyNote, /暂时不会写入|不直接/);
});

test("planning fallback: source is fallback", () => {
  const context = buildPlanningClarificationContext({
    missingSlotKeys: ["availableTime"],
    userMessage: "制定计划",
  });
  const output = composeClarificationFallback(context);
  assert.equal(output.source, "fallback");
});
