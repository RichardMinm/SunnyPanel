import assert from "node:assert/strict";
import { test } from "node:test";

import type { OrchestratorOutput } from "../../../src/lib/agent/llm/schemas/orchestrator-output";
import {
  validateAndNormalizeOrchestratorQueryScopes,
  validateAndNormalizeOrchestratorPlanQueryScopes,
} from "../../../src/lib/agent/orchestration/query-scope-contract";
import type { AgentPromptContext } from "../../../src/lib/agent/prompts";

const context = (
  plans: AgentPromptContext["plans"] = [],
): AgentPromptContext => ({
  checklists: [],
  now: "2026-07-16T12:00:00.000+08:00",
  pendingAction: null,
  plans,
});

const output = (
  intent: "query_plan_progress" | "query_progress",
  args: Record<string, unknown>,
): OrchestratorOutput => ({
  decisionCode: "pure_read_query",
  mode: "single",
  routingSummary: "读取进度",
  tasks: [{
    agentRole: "query",
    args,
    dependsOn: [],
    id: "t1",
    intent,
    label: "读取进度",
  }],
  version: 2,
});

const plan = (id: number, title: string): AgentPromptContext["plans"][number] => ({
  id,
  priority: "medium",
  state: "active",
  title,
});

test("generic progress remains aggregate with zero, one, or multiple context plans", () => {
  for (const plans of [
    [],
    [plan(7, "Release")],
    [plan(7, "Release"), plan(8, "Research")],
  ]) {
    const result = validateAndNormalizeOrchestratorQueryScopes({
      context: context(plans),
      message: "看看我的工作计划进度",
      output: output("query_progress", {}),
    });

    assert.equal(result.valid, true);
    if (!result.valid) continue;
    assert.deepEqual(result.provenances, [{
      provenance: { scope: "aggregate", source: "user_unspecified" },
      taskId: "t1",
    }]);
    assert.deepEqual(result.output.tasks[0].args, {});
  }
});

test("an explicit positive planId produces trusted specific provenance", () => {
  const result = validateAndNormalizeOrchestratorQueryScopes({
    context: context([plan(7, "Release")]),
    message: "查看 planId=7 的进度",
    output: output("query_plan_progress", { planId: 7 }),
  });

  assert.equal(result.valid, true);
  if (!result.valid) return;
  assert.deepEqual(result.provenances, [{
    provenance: { planId: 7, scope: "plan", source: "explicit_plan_id" },
    taskId: "t1",
  }]);
  assert.deepEqual(result.output.tasks[0].args, { planId: 7 });
});

test("an explicit full title must resolve exactly and uniquely before mapping", () => {
  const result = validateAndNormalizeOrchestratorQueryScopes({
    context: context([plan(7, "Release 2026"), plan(8, "Research")]),
    message: "查看 Release 2026 的进度",
    output: output("query_plan_progress", { planTitle: "  Release   2026 " }),
  });

  assert.equal(result.valid, true);
  if (!result.valid) return;
  assert.deepEqual(result.provenances, [{
    provenance: { planId: 7, scope: "plan", source: "resolved_exact_title" },
    taskId: "t1",
  }]);
  assert.deepEqual(result.output.tasks[0].args, { planId: 7 });
});

test("zero and multiple exact title matches produce typed rejection", () => {
  const notFound = validateAndNormalizeOrchestratorQueryScopes({
    context: context([plan(7, "Release 2026")]),
    message: "查看 Release 的进度",
    output: output("query_plan_progress", { planTitle: "Release" }),
  });
  assert.deepEqual(notFound, {
    code: "title_not_found",
    safeMessage: "没有唯一找到用户明确引用的计划，请确认具体计划。",
    valid: false,
  });

  const ambiguous = validateAndNormalizeOrchestratorQueryScopes({
    context: context([plan(7, "Release"), plan(8, "Release")]),
    message: "查看 Release 的进度",
    output: output("query_plan_progress", { planTitle: "Release" }),
  });
  assert.deepEqual(ambiguous, {
    code: "title_ambiguous",
    safeMessage: "找到多个同名计划，请提供计划 ID 以确认目标。",
    valid: false,
  });
});

test("a Provider-selected context ID is rejected when the user did not select it", () => {
  const result = validateAndNormalizeOrchestratorQueryScopes({
    context: context([plan(7, "Release")]),
    message: "看看我的工作计划进度",
    output: output("query_plan_progress", { planId: 7 }),
  });

  assert.deepEqual(result, {
    code: "provider_selected_workspace_resource",
    safeMessage: "用户没有明确选择具体计划，不能从工作区上下文隐式缩窄查询范围。",
    valid: false,
  });
});

test("an invalid explicit ID and an ID/title conflict are deterministic failures", () => {
  const missing = validateAndNormalizeOrchestratorQueryScopes({
    context: context([plan(7, "Release")]),
    message: "查看 planId=99 的进度",
    output: output("query_plan_progress", { planId: 99 }),
  });
  assert.deepEqual(missing, {
    code: "explicit_plan_id_not_found",
    safeMessage: "没有找到用户明确引用的计划，请确认计划 ID。",
    valid: false,
  });

  const conflict = validateAndNormalizeOrchestratorQueryScopes({
    context: context([plan(7, "Release"), plan(8, "Research")]),
    message: "查看 planId=7 的 Research 进度",
    output: output("query_plan_progress", { planId: 7, planTitle: "Research" }),
  });
  assert.deepEqual(conflict, {
    code: "id_title_conflict",
    safeMessage: "计划 ID 与标题指向不同资源，请确认要查询的计划。",
    valid: false,
  });
});

test("aggregate output cannot erase a user-selected specific plan", () => {
  const result = validateAndNormalizeOrchestratorQueryScopes({
    context: context([plan(7, "Release")]),
    message: "查看计划 7 的进度",
    output: output("query_progress", {}),
  });

  assert.deepEqual(result, {
    code: "aggregate_for_explicit_plan",
    safeMessage: "用户明确引用了具体计划，不能将查询扩大为聚合范围。",
    valid: false,
  });
});

test("typed scope diagnostics retain no raw message or title", () => {
  const sentinel = "SECRET_QUERY_TITLE";
  const result = validateAndNormalizeOrchestratorQueryScopes({
    context: context([plan(7, "Release")]),
    message: `查看 ${sentinel} 的进度`,
    output: output("query_plan_progress", { planTitle: sentinel }),
  });

  assert.equal(result.valid, false);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(sentinel));
});

test("the Legacy compatibility plan uses the same provenance guard", () => {
  const result = validateAndNormalizeOrchestratorPlanQueryScopes({
    context: context([plan(7, "Release")]),
    message: "看看我的工作计划进度",
    plan: {
      mode: "single",
      reasoning: "读取进度",
      source: "llm",
      tasks: [{
        agentRole: "query",
        args: { planId: 7 },
        dependsOn: [],
        id: "t1",
        intent: "query_plan_progress",
        label: "读取进度",
      }],
    },
  });

  assert.equal(result.valid, false);
  if (result.valid) return;
  assert.equal(result.code, "provider_selected_workspace_resource");
});
