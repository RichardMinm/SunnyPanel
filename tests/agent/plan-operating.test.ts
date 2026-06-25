import assert from "node:assert/strict";
import { test } from "node:test";

import {
  persistPlanOperatingReview,
  type PlanOperatingEvaluation,
} from "../../src/lib/agent/plan-operating";

const riskEvaluation: PlanOperatingEvaluation = {
  assistantMessage: "计划缺少 Agent Brief，且已经逾期。",
  health: "risk",
  metrics: {
    agentState: "ready",
    dueDayOffset: -2,
    executionMode: "agent",
    state: "active",
  },
  planId: 12,
  planTitle: "LangGraph 迁移",
  recommendations: ["补齐 Agent Brief。", "重新设定截止时间。"],
  scope: "plan",
};

test("plan operating review projects risky plan audits to blocked state", async () => {
  const createdRuns: Array<{ context?: unknown; data: Record<string, unknown> }> = [];
  const updatedPlans: Array<{ data: Record<string, unknown>; id: number }> = [];

  const result = await persistPlanOperatingReview(riskEvaluation, {
    createAgentRun: async (data, context) => {
      createdRuns.push({ context, data: data as Record<string, unknown> });
      return { id: 88 };
    },
    createPlanReview: async () => ({ id: 45 }),
    now: "2026-06-25T00:00:00.000Z",
    updatePlan: async (id, data) => {
      updatedPlans.push({ data: data as Record<string, unknown>, id });
    },
    userId: 7,
  });

  assert.equal(result.reviewId, 45);
  assert.equal(result.agentRunId, 88);
  assert.equal(result.projectedAgentState, "blocked");
  assert.equal(result.nextAction, "补齐 Agent Brief。");
  assert.deepEqual(updatedPlans, [
    {
      data: {
        agentState: "blocked",
        lastAgentRun: 88,
      },
      id: 12,
    },
  ]);

  const run = createdRuns[0];
  assert.ok(run);
  assert.deepEqual(run.context, { skipAgentRunPlanSync: true });
  assert.equal(run.data.workflow, "readiness-audit");
  assert.equal(run.data.status, "succeeded");
  assert.equal(run.data.relatedPlan, 12);
  assert.equal(run.data.nextAction, "补齐 Agent Brief。");
  assert.equal(run.data.user, 7);
  assert.deepEqual(run.data.relatedContent, [
    {
      relationTo: "plan-reviews",
      value: 45,
    },
  ]);
  assert.deepEqual(run.data.affectedDocuments, [
    {
      collection: "plans",
      documentId: 12,
      operation: "update",
      visibility: "unknown",
    },
  ]);
});

test("plan operating review projects non-risky plan audits to review state", async () => {
  const updatedPlans: Array<{ data: Record<string, unknown>; id: number }> = [];

  const result = await persistPlanOperatingReview(
    {
      ...riskEvaluation,
      assistantMessage: "计划指标比较稳。",
      health: "healthy",
      metrics: {
        agentState: "ready",
        dueDayOffset: 5,
        executionMode: "hybrid",
        state: "active",
      },
      recommendations: ["沉淀阶段成果。"],
    },
    {
      createAgentRun: async () => ({ id: 89 }),
      createPlanReview: async () => ({ id: 46 }),
      now: "2026-06-25T00:00:00.000Z",
      updatePlan: async (id, data) => {
        updatedPlans.push({ data: data as Record<string, unknown>, id });
      },
    },
  );

  assert.equal(result.projectedAgentState, "review");
  assert.equal(result.nextAction, "沉淀阶段成果。");
  assert.deepEqual(updatedPlans, [
    {
      data: {
        agentState: "review",
        lastAgentRun: 89,
      },
      id: 12,
    },
  ]);
});

test("overall operating review does not project a single Plan", async () => {
  const updatedPlans: Array<{ data: Record<string, unknown>; id: number }> = [];

  const result = await persistPlanOperatingReview(
    {
      assistantMessage: "整体节奏健康。",
      health: "healthy",
      metrics: { planCount: 3 },
      recommendations: ["继续推进当前主线。"],
      scope: "overall",
    },
    {
      createAgentRun: async () => ({ id: 90 }),
      createPlanReview: async () => ({ id: 47 }),
      now: "2026-06-25T00:00:00.000Z",
      updatePlan: async (id, data) => {
        updatedPlans.push({ data: data as Record<string, unknown>, id });
      },
    },
  );

  assert.equal(result.projectedAgentState, undefined);
  assert.equal(result.nextAction, "继续推进当前主线。");
  assert.deepEqual(updatedPlans, []);
});
