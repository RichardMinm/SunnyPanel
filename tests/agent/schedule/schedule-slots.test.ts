/**
 * [R6-B LEGACY HEURISTIC QUARANTINE]
 *
 * This test covers the pre-LLM Tool Planner heuristic business fallback path.
 * It is NOT part of the AGENT_REQUIRE_LLM=1 protected baseline.
 * Keep temporarily for AGENT_REQUIRE_LLM=0 legacy mode compatibility.
 * Do NOT delete until: Tool Planner replacement exists AND legacy mode is retired.
 * See: docs/phase-r6b-legacy-heuristic-test-quarantine.md
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  extractScheduleSlotsFromMessage,
  mergeScheduleSlots,
  type ScheduleSlots,
} from "../../../src/lib/agent/schedule/readiness";

test("mergeScheduleSlots does not mutate inputs", () => {
  const sessionSlots: ScheduleSlots = {
    availableDays: ["周一"],
    tasks: [{ title: "任务 A", sourceChecklistItemKey: "a" }],
  };
  const extractedSlots: ScheduleSlots = {
    availableDays: ["周二"],
    tasks: [{ title: "任务 B", sourceChecklistItemKey: "b" }],
  };

  const sessionBefore = structuredClone(sessionSlots);
  const extractedBefore = structuredClone(extractedSlots);
  mergeScheduleSlots(sessionSlots, extractedSlots);

  assert.deepEqual(sessionSlots, sessionBefore);
  assert.deepEqual(extractedSlots, extractedBefore);
});

test("empty scalar values do not overwrite useful values", () => {
  const merged = mergeScheduleSlots(
    { dailyCapacity: "每天 2 小时", preferredTime: "晚上" },
    { dailyCapacity: "   ", preferredTime: null },
  );

  assert.equal(merged.dailyCapacity, "每天 2 小时");
  assert.equal(merged.preferredTime, "晚上");
});

test("tasks are merged and deduplicated by title and sourceChecklistItemKey", () => {
  const merged = mergeScheduleSlots(
    {
      tasks: [
        { title: "完成登录页", sourceChecklistItemKey: "item-1" },
        { title: "整理文档", sourceChecklistItemKey: "item-2" },
      ],
    },
    {
      tasks: [
        { title: "完成登录页", sourceChecklistItemKey: "item-1", estimatedMinutes: 60 },
        { title: "部署预览环境", sourceChecklistItemKey: "item-3" },
      ],
    },
  );

  assert.equal(merged.tasks?.length, 3);
  assert.equal(merged.tasks?.find((item) => item.sourceChecklistItemKey === "item-1")?.estimatedMinutes, 60);
});

test("availableDays and excludedDates are deduplicated", () => {
  const merged = mergeScheduleSlots(
    { availableDays: ["周一", "周二"], excludedDates: ["2026-06-20"] },
    { availableDays: ["周二", "周三"], excludedDates: ["2026-06-20", "2026-06-21"] },
  );

  assert.deepEqual(merged.availableDays, ["周一", "周二", "周三"]);
  assert.deepEqual(merged.excludedDates, ["2026-06-20", "2026-06-21"]);
});

test("availableTimeWindows are deduplicated", () => {
  const merged = mergeScheduleSlots(
    { availableTimeWindows: [{ day: "每天", startTime: "20:00", endTime: "22:00" }] },
    {
      availableTimeWindows: [
        { day: "每天", startTime: "20:00", endTime: "22:00" },
        { day: "周末", startTime: "09:00", endTime: "12:00" },
      ],
    },
  );

  assert.deepEqual(merged.availableTimeWindows, [
    { day: "每天", startTime: "20:00", endTime: "22:00" },
    { day: "周末", startTime: "09:00", endTime: "12:00" },
  ]);
});

test("extracts time window from everyday evening phrase", () => {
  const slots = extractScheduleSlotsFromMessage("每天晚上 8 点到 10 点可以做");

  assert.deepEqual(slots.availableTimeWindows, [
    { day: "每天", startTime: "20:00", endTime: "22:00" },
  ]);
  assert.equal(slots.preferredTime, "晚上");
});

test("extracts numeric time window", () => {
  const slots = extractScheduleSlotsFromMessage("20:00-22:00 安排");

  assert.deepEqual(slots.availableTimeWindows, [
    { startTime: "20:00", endTime: "22:00" },
  ]);
});

test("extracts daily capacity and deadline", () => {
  const slots = extractScheduleSlotsFromMessage("6 月 30 日前完成，每天 2 小时");

  assert.equal(slots.deadline, "6 月 30 日前");
  assert.equal(slots.dailyCapacity, "每天 2 小时");
});

test("extracts conflict policy", () => {
  assert.equal(extractScheduleSlotsFromMessage("冲突就问我").conflictPolicy, "ask");
  assert.equal(extractScheduleSlotsFromMessage("冲突就跳过").conflictPolicy, "skip");
  assert.equal(extractScheduleSlotsFromMessage("可以重叠").conflictPolicy, "allow-overlap");
  assert.equal(extractScheduleSlotsFromMessage("自动重新安排").conflictPolicy, "reschedule");
});
