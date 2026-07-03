import assert from "node:assert/strict";
import { test } from "node:test";

import { MAX_SCHEDULE_DRAFT_ITEMS } from "../../../src/lib/agent/schedule/draft";
import { normalizeSessionState } from "../../../src/lib/agent/session/normalize-session";

test("normalizeSessionState preserves valid scheduling draft", () => {
  const session = normalizeSessionState({
    schemaVersion: 1,
    updatedAt: "2026-06-01T00:00:00.000Z",
    semantic: { domain: "schedule", stage: "drafting", workflow: "schedule_composition" },
    conversation: {},
    pending: {},
    scheduling: {
      workflow: "schedule_from_checklist",
      sourceType: "checklist",
      sourceChecklistId: 8,
      draft: {
        title: "上线清单日程草案",
        sourceType: "checklist",
        sourceChecklistId: 8,
        items: [
          {
            title: "完成登录页",
            date: "每天",
            startTime: "20:00",
            endTime: "22:00",
            estimatedMinutes: 60,
            sourceChecklistId: 8,
            sourceChecklistItemKey: "item-1",
          },
        ],
        assumptions: ["这是草案，尚未写入日程。"],
        conflicts: ["尚未检查已有日程冲突，确认写入前需要进行冲突检测。"],
        nextActions: ["调整时间"],
      },
    },
  });

  assert.equal(session.scheduling?.draft?.title, "上线清单日程草案");
  assert.equal(session.scheduling?.draft?.items[0]?.title, "完成登录页");
  assert.equal(session.scheduling?.draft?.items[0]?.sourceChecklistItemKey, "item-1");
});

test("normalizeSessionState filters invalid schedule draft items", () => {
  const session = normalizeSessionState({
    schemaVersion: 1,
    updatedAt: "2026-06-01T00:00:00.000Z",
    semantic: { domain: "schedule", stage: "drafting", workflow: "schedule_composition" },
    conversation: {},
    pending: {},
    scheduling: {
      draft: {
        title: "草案",
        sourceType: "manual",
        items: [
          { title: "有效任务", sourcePlanId: 9 },
          { title: "   " },
          { startTime: "20:00" },
        ],
      },
    },
  });

  assert.equal(session.scheduling?.draft?.items.length, 1);
  assert.equal(session.scheduling?.draft?.items[0]?.title, "有效任务");
});

test("normalizeSessionState limits schedule draft item count", () => {
  const session = normalizeSessionState({
    schemaVersion: 1,
    updatedAt: "2026-06-01T00:00:00.000Z",
    semantic: { domain: "schedule", stage: "drafting", workflow: "schedule_composition" },
    conversation: {},
    pending: {},
    scheduling: {
      draft: {
        title: "超长草案",
        sourceType: "manual",
        items: Array.from({ length: MAX_SCHEDULE_DRAFT_ITEMS + 6 }, (_, index) => ({
          title: `任务 ${index + 1}`,
        })),
      },
    },
  });

  assert.equal(session.scheduling?.draft?.items.length, MAX_SCHEDULE_DRAFT_ITEMS);
});

test("scheduling draft normalization does not disturb planning draft", () => {
  const session = normalizeSessionState({
    schemaVersion: 1,
    updatedAt: "2026-06-01T00:00:00.000Z",
    semantic: { domain: "planning", stage: "drafting", workflow: "plan_creation" },
    conversation: {},
    pending: {},
    planning: {
      workflow: "plan_creation",
      draft: {
        title: "SunnyPanel 计划草案",
        goal: "SunnyPanel 第一版上线",
        stages: [{ title: "收尾", tasks: ["修复登录页"] }],
      },
    },
    scheduling: {
      draft: {
        title: "日程草案",
        sourceType: "manual",
        items: [{ title: "修复登录页" }],
      },
    },
  });

  assert.equal(session.planning?.draft?.title, "SunnyPanel 计划草案");
  assert.equal(session.scheduling?.draft?.title, "日程草案");
});
