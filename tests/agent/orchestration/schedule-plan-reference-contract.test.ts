import assert from "node:assert/strict";
import { test } from "node:test";

import type { OrchestratorOutput } from "../../../src/lib/agent/llm/schemas/orchestrator-output";
import {
  validateSchedulePlanReferences,
} from "../../../src/lib/agent/orchestration/schedule-plan-reference-contract";
import type { AgentPromptContext } from "../../../src/lib/agent/prompts";

const context: AgentPromptContext = {
  checklists: [],
  now: "2026-07-23T12:00:00.000+08:00",
  pendingAction: null,
  plans: [
    {
      id: 101,
      priority: "medium",
      state: "active",
      title: "考研数学复习计划",
      visibility: "private",
    },
    {
      id: 102,
      priority: "medium",
      state: "active",
      title: "英语复习计划",
      visibility: "private",
    },
  ],
};

const output = (planId: number): OrchestratorOutput => ({
  decisionCode: "explicit_write_ready",
  mode: "single",
  routingSummary: "schedule an existing plan",
  tasks: [{
    agentRole: "schedule",
    args: { planId },
    dependsOn: [],
    id: "t1",
    intent: "schedule_plan",
    label: "schedule plan",
  }],
  version: 2,
});

test("accepts explicit ID-only provenance including generic labels", () => {
  const result = validateSchedulePlanReferences({
    context,
    message: "把另一个计划 101 安排到下周",
    output: output(101),
  });

  assert.equal(result.valid, true);
  if (!result.valid) return;
  assert.deepEqual(result.provenances, [{
    planId: 101,
    source: "explicit_plan_id",
    taskId: "t1",
  }]);
});

test("accepts matching exact title and ID provenance", () => {
  const result = validateSchedulePlanReferences({
    context,
    message: "把考研数学复习计划 101 安排到下周",
    output: output(101),
  });

  assert.equal(result.valid, true);
  if (!result.valid) return;
  assert.equal(
    result.provenances[0]?.source,
    "explicit_plan_id_and_exact_title",
  );
});

test("rejects a genuine exact title and ID conflict", () => {
  const result = validateSchedulePlanReferences({
    context,
    message: "把英语复习计划 101 安排到下周",
    output: output(101),
  });

  assert.deepEqual(result, {
    code: "plan_id_title_conflict",
    safeMessage: "计划 ID 与标题指向不同资源，请确认要安排的计划。",
    valid: false,
  });
});

test("rejects invalid single-task schedule references deterministically", () => {
  const cases = [
    ["安排这个计划", output(101), "explicit_plan_id_required"],
    ["把计划 101 和计划 102 安排到下周", output(101), "multiple_explicit_plan_ids"],
    ["把计划 101 安排到下周", output(102), "provider_plan_id_mismatch"],
    ["把计划 999 安排到下周", output(999), "explicit_plan_id_not_in_context"],
    [
      "把考研数学复习计划和英语复习计划 101 安排到下周",
      output(101),
      "multiple_exact_plan_titles",
    ],
  ] as const;

  for (const [message, currentOutput, code] of cases) {
    const result = validateSchedulePlanReferences({
      context,
      message,
      output: currentOutput,
    });

    assert.equal(result.valid, false, message);
    if (result.valid) continue;
    assert.equal(result.code, code, message);
  }
});

test("leaves non-schedule output unchanged with no provenance", () => {
  const currentOutput: OrchestratorOutput = {
    ...output(101),
    decisionCode: "pure_read_query",
    tasks: [{
      agentRole: "query",
      args: {},
      dependsOn: [],
      id: "t1",
      intent: "query_progress",
      label: "query progress",
    }],
  };
  const result = validateSchedulePlanReferences({
    context,
    message: "看看我的计划进度",
    output: currentOutput,
  });

  assert.deepEqual(result, {
    output: currentOutput,
    provenances: [],
    valid: true,
  });
});

test("leaves compound output to existing compound and resource contracts", () => {
  const currentOutput: OrchestratorOutput = {
    ...output(101),
    decisionCode: "compound_ready",
    mode: "compound",
    tasks: [
      output(101).tasks[0]!,
      {
        agentRole: "query",
        args: {},
        dependsOn: ["t1"],
        id: "t2",
        intent: "query_progress",
        label: "query progress",
      },
    ],
  };
  const result = validateSchedulePlanReferences({
    context,
    message: "安排这个计划，然后查看进度",
    output: currentOutput,
  });

  assert.deepEqual(result, {
    output: currentOutput,
    provenances: [],
    valid: true,
  });
});
