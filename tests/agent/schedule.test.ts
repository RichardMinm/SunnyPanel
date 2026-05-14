import assert from "node:assert/strict";
import { test } from "node:test";

import {
  detectScheduleConflictsInList,
  type ScheduleConflictItem,
} from "../../src/lib/schedule/conflicts";

const baseItems: ScheduleConflictItem[] = [
  {
    date: "2026-05-06T00:00:00.000+08:00",
    endTime: "10:00",
    id: 1,
    isAllDay: false,
    startTime: "09:00",
    status: "planned",
    title: "高数复盘",
  },
  {
    date: "2026-05-06T00:00:00.000+08:00",
    endTime: "15:00",
    id: 2,
    isAllDay: false,
    startTime: "14:00",
    status: "planned",
    title: "整理笔记",
  },
];

test("detects overlapping time range", () => {
  const conflicts = detectScheduleConflictsInList(baseItems, "2026-05-06", "09:30", "10:30");

  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0]?.title, "高数复盘");
});

test("does not flag non-overlapping time range", () => {
  const conflicts = detectScheduleConflictsInList(baseItems, "2026-05-06", "10:00", "11:00");

  assert.equal(conflicts.length, 0);
});

test("all-day item conflicts with same-day timed item", () => {
  const conflicts = detectScheduleConflictsInList(baseItems, "2026-05-06", null, null);

  assert.equal(conflicts.length, 2);
});

test("canceled items are ignored", () => {
  const conflicts = detectScheduleConflictsInList(
    [
      {
        ...baseItems[0]!,
        status: "canceled",
      },
    ],
    "2026-05-06",
    "09:30",
    "10:30",
  );

  assert.equal(conflicts.length, 0);
});
