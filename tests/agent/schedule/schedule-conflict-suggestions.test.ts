import assert from "node:assert/strict";
import { test } from "node:test";

import type { ScheduleConflict } from "../../../src/lib/agent/schedule/conflict-awareness";
import type { ScheduleDraft } from "../../../src/lib/agent/schedule/draft";
import {
  generateScheduleConflictSuggestions,
  scheduleConflictSuggestionToUserMessage,
} from "../../../src/lib/agent/schedule/conflict-suggestions";

const baseDraft = (): ScheduleDraft => ({
  assumptions: ["这是规则生成的日程草案，尚未写入日程。"],
  conflicts: ["尚未检查已有日程冲突，确认写入前需要进行冲突检测。"],
  items: [
    {
      date: "2026-06-29",
      endTime: "22:00",
      sourceChecklistItemKey: "item-login",
      startTime: "20:00",
      title: "修复登录页",
    },
    {
      date: "2026-06-29",
      endTime: "22:30",
      sourceChecklistItemKey: "item-deploy",
      startTime: "21:30",
      title: "部署验证",
    },
  ],
  nextActions: ["调整时间", "就按这个创建日程"],
  sourceChecklistId: 12,
  sourcePlanId: 99,
  sourceType: "checklist",
  title: "清单日程草案：2 项任务",
});

const conflictFor = (title: string): ScheduleConflict => ({
  existingScheduleItemId: 501,
  existingTitle: "已有发布会",
  message: `「${title}」与已有日程「已有发布会」时间重叠。`,
  proposedDate: "2026-06-29",
  proposedEndTime: "22:30",
  proposedStartTime: "21:30",
  proposedTitle: title,
  severity: "warning",
  type: "existing",
});

test("generateScheduleConflictSuggestions includes allow overlap when conflicts exist", () => {
  const suggestions = generateScheduleConflictSuggestions({
    conflicts: [conflictFor("部署验证")],
    draft: baseDraft(),
  });

  assert.ok(suggestions.some((suggestion) => suggestion.action.type === "allow_overlap"));
});

test("generateScheduleConflictSuggestions includes remove item for explicit conflict item", () => {
  const suggestions = generateScheduleConflictSuggestions({
    conflicts: [conflictFor("部署验证")],
    draft: baseDraft(),
  });

  assert.ok(
    suggestions.some(
      (suggestion) =>
        suggestion.action.type === "remove_item" &&
        suggestion.action.itemTitle === "部署验证",
    ),
  );
});

test("generateScheduleConflictSuggestions includes move item when alternate windows exist", () => {
  const suggestions = generateScheduleConflictSuggestions({
    conflicts: [conflictFor("部署验证")],
    draft: baseDraft(),
    slots: {
      availableTimeWindows: [
        { day: "2026-06-29", endTime: "22:30", startTime: "21:30" },
        { day: "2026-06-30", endTime: "17:00", startTime: "14:00" },
      ],
    },
  });

  const move = suggestions.find(
    (suggestion) =>
      suggestion.action.type === "move_item" &&
      suggestion.action.itemTitle === "部署验证",
  );

  assert.ok(move);
  if (!move || move.action.type !== "move_item") assert.fail("expected move suggestion");
  assert.equal(move.action.date, "2026-06-30");
  assert.equal(move.action.startTime, "14:00");
  assert.equal(move.action.endTime, "17:00");
  assert.match(move.description ?? "", /尚未重新检查真实冲突/);
});

test("generateScheduleConflictSuggestions includes manual adjust when no alternate window exists", () => {
  const suggestions = generateScheduleConflictSuggestions({
    conflicts: [conflictFor("部署验证")],
    draft: baseDraft(),
  });

  assert.ok(suggestions.some((suggestion) => suggestion.action.type === "manual_adjust"));
});

test("generateScheduleConflictSuggestions caps suggestions at five", () => {
  const suggestions = generateScheduleConflictSuggestions({
    conflicts: [
      conflictFor("部署验证"),
      conflictFor("修复登录页"),
      conflictFor("部署验证"),
      conflictFor("修复登录页"),
    ],
    draft: baseDraft(),
    slots: {
      availableTimeWindows: [
        { day: "2026-06-30", endTime: "11:00", startTime: "09:00" },
        { day: "2026-06-30", endTime: "17:00", startTime: "14:00" },
      ],
    },
  });

  assert.ok(suggestions.length <= 5);
});

test("generateScheduleConflictSuggestions does not mutate the draft", () => {
  const draft = baseDraft();
  const snapshot = structuredClone(draft);

  generateScheduleConflictSuggestions({
    conflicts: [conflictFor("部署验证")],
    draft,
    slots: {
      availableTimeWindows: [{ day: "2026-06-30", endTime: "17:00", startTime: "14:00" }],
    },
  });

  assert.deepEqual(draft, snapshot);
});

test("suggestions do not claim conflicts are solved or external calendars checked", () => {
  const suggestions = generateScheduleConflictSuggestions({
    conflicts: [conflictFor("部署验证")],
    draft: baseDraft(),
    slots: {
      availableTimeWindows: [{ day: "2026-06-30", endTime: "17:00", startTime: "14:00" }],
    },
  });
  const text = suggestions.map((suggestion) => `${suggestion.label} ${suggestion.description ?? ""}`).join("\n");

  assert.doesNotMatch(text, /已避开所有冲突|已找到空闲时间|已检查外部日历|自动重排完成/);
});

test("scheduleConflictSuggestionToUserMessage returns L2-readable instructions", () => {
  assert.equal(
    scheduleConflictSuggestionToUserMessage({
      action: { type: "allow_overlap" },
      id: "allow-overlap",
      label: "允许重叠并继续",
      riskLevel: "medium",
    }),
    "允许重叠",
  );
  assert.equal(
    scheduleConflictSuggestionToUserMessage({
      action: { itemTitle: "部署验证", type: "remove_item" },
      id: "remove-部署验证",
      label: "暂不安排部署验证",
      riskLevel: "low",
    }),
    "删除“部署验证”这个日程项",
  );
  assert.equal(
    scheduleConflictSuggestionToUserMessage({
      action: {
        date: "2026-06-30",
        endTime: "17:00",
        itemTitle: "部署验证",
        startTime: "14:00",
        type: "move_item",
      },
      id: "move-部署验证-2026-06-30-14:00-17:00",
      label: "改到 2026-06-30 14:00-17:00",
      riskLevel: "low",
    }),
    "把“部署验证”改到 2026-06-30 14:00-17:00",
  );
});
