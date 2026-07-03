import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeSessionState } from "../../../src/lib/agent/session/normalize-session";

test("normalizeSessionState preserves valid scheduling state", () => {
  const session = normalizeSessionState({
    schemaVersion: 1,
    updatedAt: "2026-06-01T00:00:00.000Z",
    semantic: { domain: "schedule", stage: "clarifying", workflow: "schedule_composition" },
    conversation: {},
    pending: {},
    scheduling: {
      workflow: "schedule_from_checklist",
      sourceType: "checklist",
      sourceChecklistId: 8,
      slots: {
        sourceType: "checklist",
        sourceChecklistId: 8,
        tasks: [{ title: "完成登录页", sourceChecklistItemKey: "item-1" }],
        availableTimeWindows: [{ day: "每天", startTime: "20:00", endTime: "22:00" }],
      },
      readiness: {
        status: "draftable",
        confidence: 0.82,
        knownSlots: ["sourceType", "sourceChecklistId", "tasks", "availableTimeWindows"],
        missingSlots: ["conflictPolicy"],
        suggestedQuestions: [],
        reason: "信息足够生成日程草案。",
      },
      lastSuggestedQuestions: ["冲突时怎么处理？"],
      lastUpdatedAt: "2026-06-01T00:00:00.000Z",
    },
  });

  assert.equal(session.scheduling?.workflow, "schedule_from_checklist");
  assert.equal(session.scheduling?.sourceChecklistId, 8);
  assert.equal(session.scheduling?.slots?.tasks?.[0]?.title, "完成登录页");
  assert.equal(session.scheduling?.readiness?.status, "draftable");
});

test("normalizeSessionState filters invalid scheduling source ids and limits questions", () => {
  const session = normalizeSessionState({
    schemaVersion: 1,
    updatedAt: "2026-06-01T00:00:00.000Z",
    semantic: { domain: "schedule", stage: "clarifying", workflow: "schedule_composition" },
    conversation: {},
    pending: {},
    scheduling: {
      sourcePlanId: "42",
      sourceChecklistId: -1,
      slots: {
        sourcePlanId: "42",
        sourceChecklistId: -1,
        tasks: [{ title: "任务 A" }],
      },
      lastSuggestedQuestions: ["1", "2", "3", "4", "5", "6"],
    },
  });

  assert.equal(session.scheduling?.sourcePlanId, undefined);
  assert.equal(session.scheduling?.sourceChecklistId, undefined);
  assert.equal(session.scheduling?.slots?.sourcePlanId, undefined);
  assert.equal(session.scheduling?.lastSuggestedQuestions?.length, 5);
});

test("scheduling normalization does not disturb planning state", () => {
  const session = normalizeSessionState({
    schemaVersion: 1,
    updatedAt: "2026-06-01T00:00:00.000Z",
    semantic: { domain: "planning", stage: "drafting", workflow: "plan_creation" },
    conversation: {},
    pending: {},
    planning: {
      workflow: "plan_creation",
      slots: {
        goal: "SunnyPanel 第一版上线",
        deadline: "6 月 30 日前",
      },
    },
    scheduling: {
      workflow: "schedule_from_plan",
      sourceType: "plan",
      sourcePlanId: 9,
    },
  });

  assert.equal(session.planning?.slots?.goal, "SunnyPanel 第一版上线");
  assert.equal(session.scheduling?.sourcePlanId, 9);
});
