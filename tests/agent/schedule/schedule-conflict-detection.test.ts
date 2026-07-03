import assert from "node:assert/strict";
import { test } from "node:test";

import {
  detectScheduleConflictsForItems,
  type ExistingScheduleConflictItem,
  type ProposedScheduleConflictItem,
} from "../../../src/lib/agent/schedule/conflict-awareness";

const proposed = (
  overrides: Partial<ProposedScheduleConflictItem> = {},
): ProposedScheduleConflictItem => ({
  date: "2026-06-29",
  endTime: "22:00",
  isAllDay: false,
  startTime: "20:00",
  title: "修复登录页",
  ...overrides,
});

const existing = (
  overrides: Partial<ExistingScheduleConflictItem> = {},
): ExistingScheduleConflictItem => ({
  date: "2026-06-29",
  endTime: "21:30",
  id: 501,
  isAllDay: false,
  startTime: "20:30",
  status: "planned",
  title: "已有发布会",
  ...overrides,
});

test("proposed items without overlaps return no conflicts", () => {
  const conflicts = detectScheduleConflictsForItems({
    proposedItems: [
      proposed(),
      proposed({ endTime: "23:00", startTime: "22:00", title: "整理发布文档" }),
    ],
  });

  assert.deepEqual(conflicts, []);
});

test("same-day proposed item overlap returns an internal conflict", () => {
  const conflicts = detectScheduleConflictsForItems({
    proposedItems: [
      proposed(),
      proposed({ endTime: "22:30", startTime: "21:30", title: "整理发布文档" }),
    ],
  });

  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0]?.type, "internal");
  assert.equal(conflicts[0]?.severity, "warning");
  assert.match(conflicts[0]?.message ?? "", /修复登录页/);
  assert.match(conflicts[0]?.message ?? "", /整理发布文档/);
});

test("proposed timed item overlapping existing timed item returns existing conflict", () => {
  const conflicts = detectScheduleConflictsForItems({
    existingItems: [existing()],
    proposedItems: [proposed()],
  });

  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0]?.type, "existing");
  assert.equal(conflicts[0]?.existingScheduleItemId, 501);
  assert.equal(conflicts[0]?.existingTitle, "已有发布会");
});

test("all-day existing item conflicts with same-day proposed item", () => {
  const conflicts = detectScheduleConflictsForItems({
    existingItems: [existing({ endTime: null, isAllDay: true, startTime: null, title: "全天外出" })],
    proposedItems: [proposed()],
  });

  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0]?.type, "existing");
  assert.match(conflicts[0]?.message ?? "", /全天外出/);
});

test("different dates do not conflict", () => {
  const conflicts = detectScheduleConflictsForItems({
    existingItems: [existing({ date: "2026-06-30" })],
    proposedItems: [
      proposed(),
      proposed({ date: "2026-06-30", endTime: "12:00", startTime: "11:00", title: "整理发布文档" }),
    ],
  });

  assert.deepEqual(conflicts, []);
});

test("missing proposed start or end time produces a warning without time overlap detection", () => {
  const conflicts = detectScheduleConflictsForItems({
    existingItems: [existing({ endTime: null, isAllDay: true, startTime: null })],
    proposedItems: [proposed({ endTime: null, isAllDay: false, startTime: null })],
  });

  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0]?.type, "warning");
  assert.match(conflicts[0]?.message ?? "", /缺少开始或结束时间/);
});

test("canceled existing items are ignored while done items keep existing detector semantics", () => {
  const conflicts = detectScheduleConflictsForItems({
    existingItems: [
      existing({ id: 501, status: "canceled", title: "已取消会议" }),
      existing({ id: 502, status: "done", title: "已完成复盘" }),
    ],
    proposedItems: [proposed()],
  });

  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0]?.existingScheduleItemId, 502);
  assert.match(conflicts[0]?.message ?? "", /已完成复盘/);
});

test("detectScheduleConflictsForItems does not mutate inputs", () => {
  const proposedItems = [proposed()];
  const existingItems = [existing()];
  const proposedSnapshot = structuredClone(proposedItems);
  const existingSnapshot = structuredClone(existingItems);

  detectScheduleConflictsForItems({ existingItems, proposedItems });

  assert.deepEqual(proposedItems, proposedSnapshot);
  assert.deepEqual(existingItems, existingSnapshot);
});
