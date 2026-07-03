import assert from "node:assert/strict";
import { test } from "node:test";

import {
  generateScheduleDraft,
  MAX_SCHEDULE_DRAFT_ITEMS,
  ScheduleDraftGenerationError,
} from "../../../src/lib/agent/schedule/draft";
import type { ScheduleSlots } from "../../../src/lib/agent/schedule/readiness";

const baseSlots = (): ScheduleSlots => ({
  deadline: "6 月 30 日前",
  sourceChecklistId: 12,
  sourcePlanId: 99,
  sourceType: "checklist",
  tasks: [
    {
      title: "修复登录页",
      sourceChecklistId: 12,
      sourceChecklistItemKey: "item-login",
      sourcePlanId: 99,
      sourceTaskTitle: "上线前",
      estimatedMinutes: 60,
    },
    {
      title: "整理发布文档",
      sourceChecklistItemKey: "item-docs",
    },
  ],
  availableTimeWindows: [
    { day: "每天", startTime: "20:00", endTime: "22:00" },
    { day: "周末", startTime: "09:00", endTime: "11:00" },
  ],
});

test("generateScheduleDraft turns tasks into draft items", () => {
  const draft = generateScheduleDraft({ slots: baseSlots() });

  assert.equal(draft.sourceType, "checklist");
  assert.equal(draft.items.length, 2);
  assert.equal(draft.items[0]?.title, "修复登录页");
  assert.equal(draft.items[1]?.title, "整理发布文档");
});

test("generateScheduleDraft preserves task source ids and checklist item keys", () => {
  const draft = generateScheduleDraft({ slots: baseSlots() });
  const first = draft.items[0];
  const second = draft.items[1];

  assert.equal(first?.sourcePlanId, 99);
  assert.equal(first?.sourceChecklistId, 12);
  assert.equal(first?.sourceChecklistItemKey, "item-login");
  assert.equal(first?.sourceTaskTitle, "上线前");
  assert.equal(first?.estimatedMinutes, 60);
  assert.equal(second?.sourcePlanId, 99);
  assert.equal(second?.sourceChecklistId, 12);
  assert.equal(second?.sourceChecklistItemKey, "item-docs");
});

test("generateScheduleDraft uses available time windows for draft items", () => {
  const draft = generateScheduleDraft({ slots: baseSlots() });

  assert.equal(draft.items[0]?.date, "每天");
  assert.equal(draft.items[0]?.startTime, "20:00");
  assert.equal(draft.items[0]?.endTime, "22:00");
  assert.equal(draft.items[1]?.date, "周末");
  assert.equal(draft.items[1]?.startTime, "09:00");
});

test("generateScheduleDraft with preferredTime only records assumptions", () => {
  const draft = generateScheduleDraft({
    slots: {
      dailyCapacity: "每天 2 小时",
      preferredTime: "晚上",
      sourceType: "manual",
      tasks: [{ title: "复盘上线检查" }],
    },
  });

  assert.equal(draft.items[0]?.startTime, undefined);
  assert.ok(draft.assumptions?.some((item) => /具体日期仍需确认/.test(item)));
  assert.ok(draft.assumptions?.some((item) => /晚上/.test(item)));
});

test("generateScheduleDraft carries deadline into title or assumptions", () => {
  const draft = generateScheduleDraft({ slots: baseSlots() });

  assert.match(`${draft.title}\n${draft.assumptions?.join("\n")}`, /6 月 30 日前/);
});

test("generateScheduleDraft returns typed error when tasks are missing", () => {
  assert.throws(
    () => generateScheduleDraft({ slots: { sourcePlanId: 99, sourceType: "plan" } }),
    (error) =>
      error instanceof ScheduleDraftGenerationError &&
      error.code === "missing_tasks" &&
      error.missingSlots.includes("tasks"),
  );
});

test("generateScheduleDraft records that conflicts are not checked", () => {
  const draft = generateScheduleDraft({ slots: baseSlots() });

  assert.ok(draft.conflicts?.some((item) => /尚未检查已有日程冲突/.test(item)));
});

test("generateScheduleDraft does not mutate input slots", () => {
  const slots = baseSlots();
  const before = structuredClone(slots);

  generateScheduleDraft({ slots, userMessage: "每天晚上安排" });

  assert.deepEqual(slots, before);
});

test("generateScheduleDraft limits draft item count", () => {
  const draft = generateScheduleDraft({
    slots: {
      sourceType: "manual",
      tasks: Array.from({ length: MAX_SCHEDULE_DRAFT_ITEMS + 8 }, (_, index) => ({
        title: `任务 ${index + 1}`,
      })),
      availableTimeWindows: [{ day: "每天", startTime: "20:00", endTime: "22:00" }],
    },
  });

  assert.equal(draft.items.length, MAX_SCHEDULE_DRAFT_ITEMS);
});
