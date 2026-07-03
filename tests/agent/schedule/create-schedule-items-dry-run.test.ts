import assert from "node:assert/strict";
import { test } from "node:test";

import { dryRunAgentIntent } from "../../../src/lib/agent/safety";
import type { AgentIntent } from "../../../src/lib/agent/schemas";

const createScheduleItemsIntent: Extract<AgentIntent, { intent: "create_schedule_items" }> = {
  args: {
    items: [
      {
        date: "2026-06-29",
        endTime: "22:00",
        isAllDay: false,
        relatedChecklistId: 12,
        relatedChecklistItemKey: "item-login",
        relatedPlanId: 99,
        startTime: "20:00",
        title: "修复登录页",
      },
      {
        date: "2026-06-30",
        endTime: "11:00",
        isAllDay: false,
        relatedChecklistId: 12,
        relatedChecklistItemKey: "item-docs",
        relatedPlanId: 99,
        startTime: "09:00",
        title: "整理发布文档",
      },
    ],
    sourceChecklistId: 12,
    sourcePlanId: 99,
    sourceText: "从日程草案准备创建正式日程。",
    sourceType: "checklist",
    title: "清单日程草案：2 项任务",
  },
  confidence: 0.91,
  intent: "create_schedule_items",
};

test("create_schedule_items dry-run returns proposed action without writing schedule items", async () => {
  const result = await dryRunAgentIntent(createScheduleItemsIntent, {
    createActionId: () => "action-create-schedule-items-focused-test",
  });

  assert.equal(result.type, "proposed_action");
  if (result.type !== "proposed_action") assert.fail("expected proposed action");
  assert.equal(result.action.intent, "create_schedule_items");
  assert.equal(result.action.requiresConfirmation, true);
  assert.equal(result.action.rollbackAvailable, true);
  assert.equal(result.action.affectedDocuments?.[0]?.collection, "schedule-items");
  assert.equal(result.action.affectedDocuments?.[0]?.operation, "create");
  assert.match(result.action.summary, /创建 2 个日程项/);
  assert.match(result.action.changes[0]?.preview ?? "", /确认后才会写入日程/);
  assert.deepEqual(result.action.args, createScheduleItemsIntent.args);
});

test("create_schedule_items dry-run clarifies when any item has no concrete date", async () => {
  const result = await dryRunAgentIntent({
    ...createScheduleItemsIntent,
    args: {
      ...createScheduleItemsIntent.args,
      items: [
        {
          ...createScheduleItemsIntent.args.items[0]!,
          date: "",
        },
      ],
    },
  });

  assert.equal(result.type, "clarify");
  if (result.type !== "clarify") assert.fail("expected clarify result");
  assert.equal(result.pendingAction?.type, "await_clarification");
  assert.equal(result.pendingAction?.intent, "create_schedule_items");
  assert.deepEqual(result.pendingAction?.missingFields, ["items[0].date"]);
  assert.match(result.assistantMessage, /未确定日期|补充具体日期|重新调整草案/);
});
