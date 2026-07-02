import assert from "node:assert/strict";
import { test } from "node:test";

import { generateChecklistDraftFromPlanDraft } from "../../../src/lib/agent/planning/checklist-draft";
import { evaluateChecklistDraftGeneration } from "../../../src/lib/agent/planning/checklist-draft-flow";
import { buildCreateChecklistInputFromDraft } from "../../../src/lib/agent/planning/prepare-checklist-creation";
import type { PlanDraft } from "../../../src/lib/agent/planning/draft";
import { normalizeSessionState } from "../../../src/lib/agent/session/normalize-session";

const planDraft: PlanDraft = {
  availableTime: "每天 2 小时",
  currentProgress: "登录已完成",
  deadline: "2026-06-30",
  goal: "SunnyPanel 第一版上线",
  scope: "登录、Agent 对话、部署",
  stages: [
    {
      tasks: ["修复登录页", "完成部署检查"],
      title: "上线收尾",
    },
  ],
  successCriteria: "内测可用",
  title: "SunnyPanel 第一版上线计划草案",
};

test("normalizeSessionState preserves planning sourcePlanId and draft sourcePlanId", () => {
  const session = normalizeSessionState({
    schemaVersion: 1,
    updatedAt: "2026-07-01T00:00:00.000Z",
    semantic: {
      currentTarget: { entityType: "plan", topic: "SunnyPanel 第一版上线" },
      domain: "planning",
      stage: "completed",
      workflow: "plan_creation",
    },
    conversation: {},
    pending: {},
    planning: {
      draft: {
        ...planDraft,
        sourcePlanId: 321,
      },
      sourcePlanId: 321,
      workflow: "plan_creation",
    },
  });

  assert.equal(session.planning?.sourcePlanId, 321);
  assert.equal(session.planning?.draft?.sourcePlanId, 321);
});

test("normalizeSessionState filters non-number sourcePlanId values", () => {
  const session = normalizeSessionState({
    schemaVersion: 1,
    updatedAt: "2026-07-01T00:00:00.000Z",
    semantic: {
      currentTarget: { entityType: "plan", topic: "SunnyPanel 第一版上线" },
      domain: "planning",
      stage: "completed",
      workflow: "plan_creation",
    },
    conversation: {},
    pending: {},
    planning: {
      draft: {
        ...planDraft,
        sourcePlanId: "321",
      },
      sourcePlanId: "321",
      workflow: "plan_creation",
    },
  });

  assert.equal(session.planning?.sourcePlanId, undefined);
  assert.equal(session.planning?.draft?.sourcePlanId, undefined);
});

test("generateChecklistDraftFromPlanDraft inherits explicit PlanDraft sourcePlanId", () => {
  const checklistDraft = generateChecklistDraftFromPlanDraft({
    planDraft: {
      ...planDraft,
      sourcePlanId: 321,
    },
  });

  assert.equal(checklistDraft.sourcePlanId, 321);
});

test("planning sourcePlanId can supply ChecklistDraft sourcePlanId when draft lacks it", () => {
  const result = evaluateChecklistDraftGeneration({
    intent: {
      args: { answer: "拆成清单", openDomainTopic: "SunnyPanel 第一版上线" },
      intent: "answer_question",
    },
    sessionState: {
      schemaVersion: 1,
      updatedAt: "2026-07-01T00:00:00.000Z",
      semantic: {
        currentTarget: { entityType: "plan", topic: "SunnyPanel 第一版上线" },
        domain: "planning",
        stage: "completed",
        workflow: "plan_creation",
      },
      conversation: {},
      pending: {},
      planning: {
        draft: planDraft,
        sourcePlanId: 321,
        workflow: "plan_creation",
      },
    },
    userMessage: "把这个计划拆成清单草案",
  });

  assert.equal(result.status, "generated");
  if (result.status !== "generated") assert.fail("expected checklist draft");
  assert.equal(result.planningChecklistDraft.sourcePlanId, 321);
  assert.equal(result.sessionState.planning?.draft?.sourcePlanId, 321);
  assert.equal(result.sessionState.planning?.checklistDraft?.sourcePlanId, 321);
});

test("sourcePlanTitle alone is never used to guess sourcePlanId", () => {
  const result = evaluateChecklistDraftGeneration({
    intent: {
      args: { answer: "拆成清单", openDomainTopic: "SunnyPanel 第一版上线" },
      intent: "answer_question",
    },
    sessionState: {
      schemaVersion: 1,
      updatedAt: "2026-07-01T00:00:00.000Z",
      semantic: {
        currentTarget: { entityType: "plan", topic: "SunnyPanel 第一版上线" },
        domain: "planning",
        stage: "completed",
        workflow: "plan_creation",
      },
      conversation: {},
      pending: {},
      planning: {
        draft: planDraft,
        workflow: "plan_creation",
      },
    },
    userMessage: "把这个计划拆成清单草案",
  });

  assert.equal(result.status, "generated");
  if (result.status !== "generated") assert.fail("expected checklist draft");
  assert.equal(result.planningChecklistDraft.sourcePlanId, undefined);
});

test("create_checklist args carry sourcePlanId from generated ChecklistDraft", () => {
  const checklistDraft = generateChecklistDraftFromPlanDraft({
    planDraft: {
      ...planDraft,
      sourcePlanId: 321,
    },
  });
  const result = buildCreateChecklistInputFromDraft(checklistDraft);

  assert.equal(result.ok, true);
  if (!result.ok) assert.fail("expected create checklist args");
  assert.equal(result.args.sourcePlanId, 321);
});
