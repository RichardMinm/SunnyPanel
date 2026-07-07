/**
 * Phase LLM-R3: Tool Plan Validator tests.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { validateLLMToolPlan } from "../../src/lib/agent/tool-planner";

const makePlan = (overrides: Record<string, unknown> = {}) => ({
  goal: "查看计划进度",
  intent: "query_plan_progress",
  confidence: 0.9,
  steps: [
    {
      id: "step-1",
      toolName: "query_plan_progress",
      mode: "read",
      reason: "查看计划完成情况",
      input: { planTitle: "My Plan" },
      riskLevel: "low",
    },
  ],
  ...overrides,
});

/* ──── Accept legal plans ──── */

test("accepts legal read plan", () => {
  const result = validateLLMToolPlan(makePlan());
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.plan.steps.length, 1);
    assert.equal(result.plan.steps[0]!.toolName, "query_plan_progress");
    assert.equal(result.plan.steps[0]!.mode, "read");
  }
});

test("accepts legal draft plan", () => {
  const result = validateLLMToolPlan(
    makePlan({
      intent: "compose_plan",
      steps: [
        {
          id: "step-1",
          toolName: "compose_plan",
          mode: "draft",
          reason: "生成计划草案",
          input: { goal: "Learn Rust" },
          riskLevel: "medium",
        },
      ],
    }),
  );
  assert.equal(result.ok, true);
});

test("accepts legal write tool with dry_run plan", () => {
  const result = validateLLMToolPlan(
    makePlan({
      intent: "create_plan",
      steps: [
        {
          id: "step-1",
          toolName: "create_plan",
          mode: "dry_run",
          reason: "预览创建计划",
          input: { title: "New Plan" },
          riskLevel: "medium",
        },
      ],
    }),
  );
  assert.equal(result.ok, true);
});

test("accepts multi-step plan with dependencies", () => {
  const result = validateLLMToolPlan(
    makePlan({
      steps: [
        {
          id: "step-1",
          toolName: "query_plan_progress",
          mode: "read",
          reason: "查看计划",
          input: {},
          riskLevel: "low",
        },
        {
          id: "step-2",
          toolName: "compose_plan",
          mode: "draft",
          reason: "生成草案",
          input: {},
          dependsOn: ["step-1"],
          riskLevel: "medium",
        },
      ],
    }),
  );
  assert.equal(result.ok, true);
});

test("accepts plan with missingInformation but no dry_run steps", () => {
  const result = validateLLMToolPlan(
    makePlan({
      confidence: 0.7,
      missingInformation: ["deadline", "scope"],
      steps: [
        {
          id: "step-1",
          toolName: "compose_plan",
          mode: "draft",
          reason: "生成草案",
          input: {},
          riskLevel: "medium",
        },
      ],
    }),
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.ok(result.plan.missingInformation);
    assert.equal(result.plan.missingInformation!.length, 2);
  }
});

test("accepts draft tool with dry_run mode", () => {
  const result = validateLLMToolPlan(
    makePlan({
      steps: [
        {
          id: "step-1",
          toolName: "compose_schedule_item",
          mode: "dry_run",
          reason: "预览日程草案",
          input: {},
          riskLevel: "medium",
        },
      ],
    }),
  );
  assert.equal(result.ok, true);
});

/* ──── Reject unsafe plans ──── */

test("rejects plan with no steps", () => {
  const result = validateLLMToolPlan(makePlan({ steps: [] }));
  assert.equal(result.ok, false);
});

test("rejects mode: execute", () => {
  const result = validateLLMToolPlan(
    makePlan({
      steps: [
        {
          id: "step-1",
          toolName: "create_plan",
          mode: "execute",
          reason: "创建计划",
          input: {},
          riskLevel: "high",
        },
      ],
    }),
  );
  assert.equal(result.ok, false);
  assert.ok(result.reason.includes("execute"));
});

test("rejects unknown tool name", () => {
  const result = validateLLMToolPlan(
    makePlan({
      steps: [
        {
          id: "step-1",
          toolName: "non_existent_tool",
          mode: "read",
          reason: "test",
          input: {},
          riskLevel: "low",
        },
      ],
    }),
  );
  assert.equal(result.ok, false);
  assert.ok(result.reason.includes("unknown"));
});

test("rejects write tool with mode: read", () => {
  const result = validateLLMToolPlan(
    makePlan({
      steps: [
        {
          id: "step-1",
          toolName: "create_plan",
          mode: "read",
          reason: "尝试以只读模式创建",
          input: {},
          riskLevel: "low",
        },
      ],
    }),
  );
  assert.equal(result.ok, false);
  assert.ok(result.reason.includes("dry_run"));
});

test("rejects write tool with mode: draft", () => {
  const result = validateLLMToolPlan(
    makePlan({
      steps: [
        {
          id: "step-1",
          toolName: "create_plan",
          mode: "draft",
          reason: "尝试以草案模式创建",
          input: {},
          riskLevel: "medium",
        },
      ],
    }),
  );
  assert.equal(result.ok, false);
  assert.ok(result.reason.includes("dry_run"));
});

test("rejects read tool with mode: dry_run", () => {
  const result = validateLLMToolPlan(
    makePlan({
      steps: [
        {
          id: "step-1",
          toolName: "query_plan_progress",
          mode: "dry_run",
          reason: "尝试预览读操作",
          input: {},
          riskLevel: "low",
        },
      ],
    }),
  );
  assert.equal(result.ok, false);
  assert.ok(result.reason.includes("read"));
});

test("rejects confidence < 0", () => {
  const result = validateLLMToolPlan(makePlan({ confidence: -0.1 }));
  assert.equal(result.ok, false);
});

test("rejects confidence > 1", () => {
  const result = validateLLMToolPlan(makePlan({ confidence: 1.5 }));
  assert.equal(result.ok, false);
});

test("rejects confidence below minConfidence", () => {
  const result = validateLLMToolPlan(makePlan({ confidence: 0.3 }), { minConfidence: 0.5 });
  assert.equal(result.ok, false);
  assert.ok(result.reason.includes("confidence"));
});

test("rejects steps exceeding maxSteps default", () => {
  const result = validateLLMToolPlan(
    makePlan({
      steps: Array.from({ length: 10 }, (_, i) => ({
        id: `step-${i}`,
        toolName: "query_plan_progress",
        mode: "read",
        reason: `step ${i}`,
        input: {},
        riskLevel: "low",
      })),
    }),
  );
  assert.equal(result.ok, false);
});

test("rejects missingInformation + dry_run steps", () => {
  const result = validateLLMToolPlan(
    makePlan({
      missingInformation: ["deadline"],
      steps: [
        {
          id: "step-1",
          toolName: "create_plan",
          mode: "dry_run",
          reason: "预览创建计划",
          input: {},
          riskLevel: "medium",
        },
      ],
    }),
  );
  assert.equal(result.ok, false);
  assert.ok(result.reason.includes("missing"));
});

test("rejects dependsOn referencing non-existent step", () => {
  const result = validateLLMToolPlan(
    makePlan({
      steps: [
        {
          id: "step-1",
          toolName: "create_plan",
          mode: "dry_run",
          reason: "预览",
          input: {},
          dependsOn: ["nonexistent-step"],
          riskLevel: "medium",
        },
      ],
    }),
  );
  assert.equal(result.ok, false);
  assert.ok(result.reason.includes("does not exist"));
});

test("rejects circular dependency (3 steps)", () => {
  const result = validateLLMToolPlan(
    makePlan({
      steps: [
        {
          id: "step-1",
          toolName: "query_plan_progress",
          mode: "read",
          reason: "查1",
          input: {},
          dependsOn: ["step-3"],
          riskLevel: "low",
        },
        {
          id: "step-2",
          toolName: "query_plan_progress",
          mode: "read",
          reason: "查2",
          input: {},
          dependsOn: ["step-1"],
          riskLevel: "low",
        },
        {
          id: "step-3",
          toolName: "query_plan_progress",
          mode: "read",
          reason: "查3",
          input: {},
          dependsOn: ["step-2"],
          riskLevel: "low",
        },
      ],
    }),
  );
  assert.equal(result.ok, false);
  assert.ok(result.reason.includes("Circular"));
});

test("rejects plan containing forbidden term: apiKey", () => {
  const plan = makePlan();
  (plan as Record<string, unknown>).apiKey = "sk-12345";
  const result = validateLLMToolPlan(plan);
  assert.equal(result.ok, false);
});

test("rejects plan containing forbidden term in step input", () => {
  const result = validateLLMToolPlan(
    makePlan({
      steps: [
        {
          id: "step-1",
          toolName: "query_plan_progress",
          mode: "read",
          reason: "test",
          input: { api_key: "secret" },
          riskLevel: "low",
        },
      ],
    }),
  );
  assert.equal(result.ok, false);
});

test("rejects non-object input", () => {
  const result = validateLLMToolPlan("not an object");
  assert.equal(result.ok, false);
});

test("rejects null input", () => {
  const result = validateLLMToolPlan(null);
  assert.equal(result.ok, false);
});

test("rejects array input", () => {
  const result = validateLLMToolPlan([1, 2, 3]);
  assert.equal(result.ok, false);
});

test("validation never creates pendingAction", () => {
  const result = validateLLMToolPlan(makePlan());
  // The validation result is pure data — no side effects
  assert.ok("ok" in result);
  // No pendingAction field anywhere
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes("pendingAction"));
});

test("manual inputSchema tool gets warning", () => {
  const result = validateLLMToolPlan(
    makePlan({
      steps: [
        {
          id: "step-1",
          toolName: "compose_plan",
          mode: "draft",
          reason: "生成草案",
          input: {}, // valid but manual schema
          riskLevel: "medium",
        },
      ],
    }),
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    // Should have warning about manual schema
    const hasManualWarning = result.warnings.some((w) => w.includes("manual"));
    assert.ok(hasManualWarning, "Expected warning about manual inputSchema");
  }
});
