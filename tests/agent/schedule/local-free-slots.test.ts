import assert from "node:assert/strict";
import { test } from "node:test";

import {
  findLocalFreeSlots,
  type FindLocalFreeSlotsInput,
} from "../../../src/lib/agent/schedule/free-slots";

const baseInput = (overrides: Partial<FindLocalFreeSlotsInput> = {}): FindLocalFreeSlotsInput => ({
  availableTimeWindows: [
    {
      date: "2026-06-30",
      endTime: "12:00",
      startTime: "09:00",
    },
  ],
  busyBlocks: [],
  durationMinutes: 60,
  ...overrides,
});

test("findLocalFreeSlots returns available window when there are no busy blocks", () => {
  const slots = findLocalFreeSlots(baseInput());

  assert.deepEqual(slots, [
    {
      date: "2026-06-30",
      durationMinutes: 180,
      endTime: "12:00",
      reason: "SunnyPanel 本地日程在该时间窗内没有占用。",
      startTime: "09:00",
    },
  ]);
});

test("findLocalFreeSlots splits a time window around busy blocks", () => {
  const slots = findLocalFreeSlots(baseInput({
    busyBlocks: [
      {
        date: "2026-06-30",
        endTime: "11:00",
        startTime: "10:00",
        title: "已有会议",
      },
    ],
  }));

  assert.deepEqual(slots.map((slot) => `${slot.startTime}-${slot.endTime}`), [
    "09:00-10:00",
    "11:00-12:00",
  ]);
});

test("findLocalFreeSlots treats all-day busy block as occupying the whole day", () => {
  const slots = findLocalFreeSlots(baseInput({
    busyBlocks: [
      {
        date: "2026-06-30",
        isAllDay: true,
        title: "全天发布",
      },
    ],
  }));

  assert.deepEqual(slots, []);
});

test("findLocalFreeSlots keeps different dates independent", () => {
  const slots = findLocalFreeSlots(baseInput({
    availableTimeWindows: [
      { date: "2026-06-30", endTime: "12:00", startTime: "09:00" },
      { date: "2026-07-01", endTime: "12:00", startTime: "09:00" },
    ],
    busyBlocks: [
      {
        date: "2026-06-30",
        endTime: "12:00",
        startTime: "09:00",
      },
    ],
  }));

  assert.deepEqual(slots.map((slot) => slot.date), ["2026-07-01"]);
});

test("findLocalFreeSlots omits slots shorter than durationMinutes", () => {
  const slots = findLocalFreeSlots(baseInput({
    busyBlocks: [
      {
        date: "2026-06-30",
        endTime: "11:00",
        startTime: "10:00",
      },
    ],
    durationMinutes: 90,
  }));

  assert.deepEqual(slots, []);
});

test("findLocalFreeSlots sorts multiple busy blocks before splitting", () => {
  const slots = findLocalFreeSlots(baseInput({
    availableTimeWindows: [
      {
        date: "2026-06-30",
        endTime: "18:00",
        startTime: "09:00",
      },
    ],
    busyBlocks: [
      {
        date: "2026-06-30",
        endTime: "17:00",
        startTime: "16:00",
      },
      {
        date: "2026-06-30",
        endTime: "10:00",
        startTime: "09:30",
      },
      {
        date: "2026-06-30",
        endTime: "14:00",
        startTime: "13:00",
      },
    ],
  }));

  assert.deepEqual(slots.map((slot) => `${slot.startTime}-${slot.endTime}`), [
    "10:00-13:00",
    "14:00-16:00",
    "17:00-18:00",
  ]);
});

test("findLocalFreeSlots respects maxSuggestions", () => {
  const slots = findLocalFreeSlots(baseInput({
    availableTimeWindows: [
      { date: "2026-06-30", endTime: "10:00", startTime: "09:00" },
      { date: "2026-06-30", endTime: "12:00", startTime: "11:00" },
      { date: "2026-06-30", endTime: "15:00", startTime: "14:00" },
    ],
    maxSuggestions: 2,
  }));

  assert.equal(slots.length, 2);
  assert.deepEqual(slots.map((slot) => slot.startTime), ["09:00", "11:00"]);
});

test("findLocalFreeSlots does not mutate input", () => {
  const input = baseInput({
    busyBlocks: [
      {
        date: "2026-06-30",
        endTime: "10:30",
        startTime: "09:30",
      },
    ],
  });
  const snapshot = structuredClone(input);

  findLocalFreeSlots(input);

  assert.deepEqual(input, snapshot);
});
