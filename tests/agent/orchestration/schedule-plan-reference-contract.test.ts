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

const compoundOutput = (planId: number): OrchestratorOutput => ({
  decisionCode: "compound_ready",
  mode: "compound",
  routingSummary: "schedule an existing plan and query progress",
  tasks: [
    {
      ...output(planId).tasks[0]!,
      id: "t1",
    },
    {
      agentRole: "query",
      args: { scope: "all" },
      dependsOn: ["t1"],
      id: "t2",
      intent: "query_progress",
      label: "query progress",
    },
  ],
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
  const outputPassedToValidator = output(101);
  const result = validateSchedulePlanReferences({
    context,
    message: "把考研数学复习计划 101 安排到下周",
    output: outputPassedToValidator,
  });

  assert.equal(result.valid, true);
  if (!result.valid) return;
  assert.equal(result.output, outputPassedToValidator);
  assert.deepEqual(result.corrections, []);
  assert.equal(
    result.provenances[0]?.source,
    "explicit_plan_id_and_exact_title",
  );
});

test("rebinds only supported schedule fields and removes all Provider identity residue", () => {
  const providerOutput: OrchestratorOutput = {
    ...output(999),
    routingSummary: "安排 Provider 计划 999 的旧标题",
    tasks: [{
      ...output(999).tasks[0]!,
      args: {
        defaultDurationMinutes: 45,
        defaultStartTime: "09:30",
        planId: 999,
        planTitle: "Provider 旧标题",
        startDate: "2026-07-28",
        unsupportedIdentity: 999,
      },
      label: "安排 Provider 计划 999 的旧标题",
    }],
  };
  const result = validateSchedulePlanReferences({
    context,
    message: "把计划 101 安排到下周",
    output: providerOutput,
  });

  assert.equal(result.valid, true);
  if (!result.valid) return;
  assert.deepEqual(result.output.tasks[0]?.args, {
    defaultDurationMinutes: 45,
    defaultStartTime: "09:30",
    planId: 101,
    startDate: "2026-07-28",
  });
  assert.equal(result.output.routingSummary, "安排已有计划");
  assert.equal(result.output.tasks[0]?.label, "安排已有计划");
  assert.doesNotMatch(JSON.stringify(result.output), /999|Provider 旧标题/u);
  assert.equal(providerOutput.tasks[0]?.args.planId, 999);
  assert.notEqual(result.output, providerOutput);
  assert.notEqual(result.output.tasks[0], providerOutput.tasks[0]);
  assert.deepEqual(result.corrections, [{
    code: "provider_plan_id_rebound",
    taskId: "t1",
  }]);
  assert.deepEqual(result.provenances, [{
    planId: 101,
    source: "explicit_plan_id",
    taskId: "t1",
  }]);
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

test("rejects an explicit plan ID outside context before a Provider ID can rebind", () => {
  const outsideOutput = output(102);
  const outsideResult = validateSchedulePlanReferences({
    context: { ...context, plans: context.plans.slice(0, 1) },
    message: "把计划 999 安排到下周",
    output: outsideOutput,
  });

  assert.equal(outsideResult.valid, false);
  if (outsideResult.valid) return;
  assert.equal(outsideResult.code, "explicit_plan_id_not_in_context");
  assert.deepEqual(outsideOutput.tasks[0]?.args, { planId: 102 });
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
    corrections: [],
    output: currentOutput,
    provenances: [],
    valid: true,
  });
});

// Mutation caught: restoring the compound-mode early return would accept a
// context-only Provider plan ID without deterministic user provenance.
test("rejects a context-only plan reference in a compound output", () => {
  const currentOutput = compoundOutput(101);
  const result = validateSchedulePlanReferences({
    context,
    message: "安排这个计划，然后查看进度",
    output: currentOutput,
  });

  assert.deepEqual(result, {
    code: "explicit_plan_id_required",
    safeMessage: "安排已有计划需要用户明确提供一个计划 ID。",
    valid: false,
  });
});

// Mutation caught: rejecting every compound schedule would discard a valid,
// explicit actor-authorized user plan ID.
test("binds one explicit user plan ID to one compound schedule task", () => {
  const currentOutput = compoundOutput(101);
  const result = validateSchedulePlanReferences({
    context,
    message: "安排计划 101，然后查看进度",
    output: currentOutput,
  });

  assert.equal(result.valid, true);
  if (!result.valid) return;
  assert.equal(result.output, currentOutput);
  assert.deepEqual(result.corrections, []);
  assert.deepEqual(result.provenances, [{
    planId: 101,
    source: "explicit_plan_id",
    taskId: "t1",
  }]);
});

// Mutation caught: trusting the Provider-selected context ID or rebuilding the
// whole compound output would change the user target or damage the task DAG.
test("rebinds only the compound schedule task and preserves the dependency DAG", () => {
  const currentOutput = compoundOutput(102);
  const originalQueryTask = currentOutput.tasks[1];
  const originalDependencies = currentOutput.tasks.map(
    ({ dependsOn }) => [...dependsOn],
  );
  const result = validateSchedulePlanReferences({
    context,
    message: "安排计划 101，然后查看进度",
    output: currentOutput,
  });

  assert.equal(result.valid, true);
  if (!result.valid) return;
  assert.deepEqual(
    result.output.tasks.map(({ dependsOn }) => dependsOn),
    originalDependencies,
  );
  assert.deepEqual(
    result.output.tasks.map(({ id, intent }) => ({ id, intent })),
    [
      { id: "t1", intent: "schedule_plan" },
      { id: "t2", intent: "query_progress" },
    ],
  );
  assert.deepEqual(result.output.tasks[0]?.args, { planId: 101 });
  assert.equal(result.output.tasks[1], originalQueryTask);
  assert.deepEqual(result.output.tasks[1]?.args, { scope: "all" });
  assert.deepEqual(result.corrections, [{
    code: "provider_plan_id_rebound",
    taskId: "t1",
  }]);
  assert.deepEqual(result.provenances, [{
    planId: 101,
    source: "explicit_plan_id",
    taskId: "t1",
  }]);
});

// Mutation caught: reusing one explicit ID across multiple compound mutation
// tasks would authorize more schedule writes than the user selected.
test("rejects more than one compound schedule task", () => {
  const currentOutput: OrchestratorOutput = {
    ...compoundOutput(101),
    tasks: [
      {
        ...output(101).tasks[0]!,
        id: "t1",
      },
      {
        ...output(101).tasks[0]!,
        dependsOn: ["t1"],
        id: "t2",
      },
    ],
  };
  const result = validateSchedulePlanReferences({
    context,
    message: "安排计划 101",
    output: currentOutput,
  });

  assert.equal(result.valid, false);
  if (result.valid) return;
  assert.equal(result.code, "multiple_schedule_plan_tasks");
  assert.equal(result.safeMessage.trim().length > 0, true);
});
