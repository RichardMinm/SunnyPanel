import assert from "node:assert/strict";
import { test } from "node:test";

import type { ScheduleConflict } from "../../../src/lib/agent/schedule/conflict-awareness";
import type { ScheduleDraft } from "../../../src/lib/agent/schedule/draft";
import {
  generateScheduleConflictSuggestions,
} from "../../../src/lib/agent/schedule/conflict-suggestions";

const baseDraft = (): ScheduleDraft => ({
  assumptions: ["这是规则生成的日程草案，尚未写入日程。"],
  conflicts: ["尚未检查已有日程冲突，确认写入前需要进行冲突检测。"],
  items: [
    {
      date: "2026-06-30",
      endTime: "21:00",
      sourceChecklistItemKey: "item-deploy",
      startTime: "20:00",
      title: "部署验证",
    },
  ],
  nextActions: ["调整时间", "就按这个创建日程"],
  sourceChecklistId: 12,
  sourcePlanId: 99,
  sourceType: "checklist",
  title: "清单日程草案：1 项任务",
});

const conflictFor = (title: string): ScheduleConflict => ({
  existingScheduleItemId: 501,
  existingTitle: "已有发布会",
  message: `「${title}」与已有日程「已有发布会」时间重叠。`,
  proposedDate: "2026-06-30",
  proposedEndTime: "21:00",
  proposedStartTime: "20:00",
  proposedTitle: title,
  severity: "warning",
  type: "existing",
});

test("generateScheduleConflictSuggestions uses local free slot for move suggestion", () => {
  const suggestions = generateScheduleConflictSuggestions({
    busyBlocks: [
      {
        date: "2026-06-30",
        endTime: "21:00",
        sourceId: 501,
        startTime: "20:00",
        title: "已有发布会",
      },
    ],
    conflicts: [conflictFor("部署验证")],
    draft: baseDraft(),
    slots: {
      availableTimeWindows: [
        { day: "2026-06-30", endTime: "23:00", startTime: "20:00" },
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
  assert.equal(move.action.startTime, "21:00");
  assert.equal(move.action.endTime, "22:00");
  assert.match(move.description ?? "", /仅基于 SunnyPanel 本地日程检测，未包含外部日历/);
});

test("generateScheduleConflictSuggestions falls back to manual adjust when no local free slot exists", () => {
  const suggestions = generateScheduleConflictSuggestions({
    busyBlocks: [
      {
        date: "2026-06-30",
        endTime: "23:00",
        sourceId: 501,
        startTime: "20:00",
        title: "已有发布会",
      },
    ],
    conflicts: [conflictFor("部署验证")],
    draft: baseDraft(),
    slots: {
      availableTimeWindows: [
        { day: "2026-06-30", endTime: "23:00", startTime: "20:00" },
      ],
    },
  });

  assert.equal(
    suggestions.some((suggestion) => suggestion.action.type === "move_item"),
    false,
  );
  assert.ok(suggestions.some((suggestion) => suggestion.action.type === "manual_adjust"));
});

test("local suggestions do not claim solved conflicts or external calendar checks", () => {
  const suggestions = generateScheduleConflictSuggestions({
    busyBlocks: [
      {
        date: "2026-06-30",
        endTime: "21:00",
        sourceId: 501,
        startTime: "20:00",
        title: "已有发布会",
      },
    ],
    conflicts: [conflictFor("部署验证")],
    draft: baseDraft(),
    slots: {
      availableTimeWindows: [
        { day: "2026-06-30", endTime: "23:00", startTime: "20:00" },
      ],
    },
  });
  const text = suggestions
    .map((suggestion) => `${suggestion.label} ${suggestion.description ?? ""}`)
    .join("\n");

  assert.doesNotMatch(text, /已避开所有冲突|已检查外部日历|Google|外部 Calendar/u);
});

test("local suggestions do not mutate the schedule draft", () => {
  const draft = baseDraft();
  const snapshot = structuredClone(draft);

  generateScheduleConflictSuggestions({
    busyBlocks: [
      {
        date: "2026-06-30",
        endTime: "21:00",
        startTime: "20:00",
      },
    ],
    conflicts: [conflictFor("部署验证")],
    draft,
    slots: {
      availableTimeWindows: [
        { day: "2026-06-30", endTime: "23:00", startTime: "20:00" },
      ],
    },
  });

  assert.deepEqual(draft, snapshot);
});
