import assert from "node:assert/strict";
import { test } from "node:test";

import {
  evaluateScheduleReadiness,
  type ScheduleTaskSlot,
} from "../../../src/lib/agent/schedule/readiness";

const task = (title = "完成登录页修复"): ScheduleTaskSlot => ({
  title,
});

test("tasks only is insufficient", () => {
  const readiness = evaluateScheduleReadiness({
    slots: { tasks: [task()] },
    userMessage: "把这个清单安排到日程",
  });

  assert.equal(readiness.status, "insufficient");
  assert.ok(readiness.missingSlots.includes("availableTimeWindows"));
});

test("tasks plus deadline without available time is insufficient", () => {
  const readiness = evaluateScheduleReadiness({
    slots: { deadline: "6 月 30 日前", tasks: [task()] },
    userMessage: "把这些任务排到 6 月 30 日前",
  });

  assert.equal(readiness.status, "insufficient");
  assert.ok(readiness.missingSlots.includes("dailyCapacity"));
});

test("tasks plus deadline and available time window is draftable", () => {
  const readiness = evaluateScheduleReadiness({
    slots: {
      deadline: "6 月 30 日前",
      tasks: [task()],
      availableTimeWindows: [{ day: "每天", startTime: "20:00", endTime: "22:00" }],
    },
    userMessage: "把这些任务安排到 6 月 30 日前，每天晚上 8 点到 10 点可以做。",
  });

  assert.equal(readiness.status, "draftable");
});

test("tasks plus preferred time and daily capacity is draftable", () => {
  const readiness = evaluateScheduleReadiness({
    slots: {
      dailyCapacity: "每天 2 小时",
      preferredTime: "晚上",
      tasks: [task()],
    },
    userMessage: "这些任务每天 2 小时，晚上安排。",
  });

  assert.equal(readiness.status, "draftable");
});

test("existing draft plus explicit create intent is confirmable", () => {
  const readiness = evaluateScheduleReadiness({
    hasExistingDraft: true,
    slots: { tasks: [task()] },
    userMessage: "就按这个日程创建",
  });

  assert.equal(readiness.status, "confirmable");
});

test("source plan without time context is insufficient", () => {
  const readiness = evaluateScheduleReadiness({
    slots: { sourcePlanId: 42, sourceType: "plan" },
    userMessage: "把这个计划安排到日程",
  });

  assert.equal(readiness.status, "insufficient");
});

test("source checklist without time context is insufficient", () => {
  const readiness = evaluateScheduleReadiness({
    slots: { sourceChecklistId: 7, sourceType: "checklist" },
    userMessage: "把这个清单排进这周",
  });

  assert.equal(readiness.status, "insufficient");
});

test("plan or checklist source cannot become confirmable without an existing draft", () => {
  const readiness = evaluateScheduleReadiness({
    explicitCreateIntent: true,
    slots: {
      sourceChecklistId: 7,
      sourceType: "checklist",
      tasks: [task()],
      availableTimeWindows: [{ day: "每天", startTime: "20:00", endTime: "22:00" }],
    },
    userMessage: "保存到日程",
  });

  assert.notEqual(readiness.status, "confirmable");
});

test("insufficient questions are capped and avoid known slots", () => {
  const readiness = evaluateScheduleReadiness({
    slots: { deadline: "6 月 30 日前", tasks: [task()] },
    userMessage: "把这些任务排到 6 月 30 日前",
  });

  assert.ok(readiness.suggestedQuestions.length <= 5);
  assert.ok(readiness.suggestedQuestions.some((q) => /投入|时间段|晚上|上午|周末/.test(q)));
  assert.equal(readiness.suggestedQuestions.some((q) => /哪段时间之前|什么时候完成/.test(q)), false);
});

test("insufficient questions can include conflict policy", () => {
  const readiness = evaluateScheduleReadiness({
    slots: { tasks: [task()] },
    userMessage: "帮我排到日程",
  });

  assert.ok(readiness.suggestedQuestions.some((q) => /冲突/.test(q)));
});
