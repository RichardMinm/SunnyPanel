import assert from "node:assert/strict";
import { test } from "node:test";

import type { AgentPromptContext } from "../../../src/lib/agent/prompts";
import {
  analyzePlanReferenceEvidence,
} from "../../../src/lib/agent/orchestration/plan-reference-evidence";

const context = (plans: AgentPromptContext["plans"]): AgentPromptContext => ({
  checklists: [],
  contentItems: [],
  memories: [],
  now: "2026-07-23T12:00:00.000+08:00",
  pendingAction: null,
  plans,
  schedules: [],
});

const plans = context([
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
]);

test("collects explicit positive plan IDs without treating generic labels as titles", () => {
  const evidence = analyzePlanReferenceEvidence({
    context: plans,
    message: "把另一个计划 101 安排到下周",
  });

  assert.deepEqual(evidence.explicitPlanIds, [101]);
  assert.deepEqual(evidence.exactTitlePlans, []);
});

test("collects complete actor-authorized plan titles only", () => {
  const evidence = analyzePlanReferenceEvidence({
    context: plans,
    message: "把英语复习计划 101 安排到下周",
  });

  assert.deepEqual(evidence.explicitPlanIds, [101]);
  assert.deepEqual(
    evidence.exactTitlePlans.map(({ id }) => id),
    [102],
  );
});

test("normalizes full-width explicit IDs and excludes title-only plans without IDs", () => {
  const evidence = analyzePlanReferenceEvidence({
    context: context([
      {
        id: null,
        priority: "medium",
        state: "active",
        title: "无编号计划",
        visibility: "private",
      },
    ]),
    message: "把计划 １０１ 安排到下周",
  });

  assert.deepEqual(evidence.explicitPlanIds, [101]);
  assert.deepEqual(evidence.trustedPlans, []);
  assert.deepEqual(evidence.exactTitlePlans, []);
});
