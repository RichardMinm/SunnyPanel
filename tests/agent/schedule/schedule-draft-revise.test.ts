import assert from "node:assert/strict";
import { test } from "node:test";

import type { ScheduleConflict } from "../../../src/lib/agent/schedule/conflict-awareness";
import type { ScheduleDraft } from "../../../src/lib/agent/schedule/draft";
import { reviseScheduleDraft } from "../../../src/lib/agent/schedule/revise-draft";

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
      sourceChecklistItemKey: "item-docs",
      startTime: "21:30",
      title: "部署验证",
    },
    {
      date: "2026-06-30",
      endTime: "11:00",
      sourceChecklistItemKey: "item-summary",
      startTime: "09:00",
      title: "复盘总结",
    },
  ],
  nextActions: ["调整时间", "就按这个创建日程"],
  sourceChecklistId: 12,
  sourcePlanId: 99,
  sourceType: "checklist",
  title: "清单日程草案：3 项任务",
});

const conflictFor = (title: string): ScheduleConflict => ({
  existingScheduleItemId: 501,
  existingTitle: "已有发布会",
  message: `「${title}」与已有日程「已有发布会」时间重叠。`,
  proposedDate: "2026-06-29",
  proposedEndTime: "22:00",
  proposedStartTime: "20:00",
  proposedTitle: title,
  severity: "warning",
  type: "existing",
});

test("reviseScheduleDraft updates matched item date", () => {
  const result = reviseScheduleDraft({
    draft: baseDraft(),
    referenceDate: "2026-06-29T00:00:00.000+08:00",
    userMessage: "把“部署验证”改到明天上午",
  });

  assert.equal(result.needsClarification, false);
  assert.equal(result.draft.items[1]?.date, "2026-06-30");
  assert.equal(result.draft.items[1]?.startTime, "09:00");
  assert.equal(result.draft.items[1]?.endTime, "11:00");
  assert.equal(result.draft.items[0]?.date, "2026-06-29");
});

test("reviseScheduleDraft updates matched item startTime and endTime", () => {
  const result = reviseScheduleDraft({
    draft: baseDraft(),
    referenceDate: "2026-06-29T00:00:00.000+08:00",
    userMessage: "“修复登录页”改到 20:00-22:00",
  });

  assert.equal(result.needsClarification, false);
  assert.equal(result.draft.items[0]?.startTime, "20:00");
  assert.equal(result.draft.items[0]?.endTime, "22:00");
  assert.equal(result.appliedActions[0]?.type, "update_time");
});

test("reviseScheduleDraft updates only conflicting items", () => {
  const result = reviseScheduleDraft({
    conflicts: [conflictFor("部署验证")],
    draft: baseDraft(),
    referenceDate: "2026-06-29T00:00:00.000+08:00",
    userMessage: "把冲突的改到明天下午",
  });

  assert.equal(result.needsClarification, false);
  assert.equal(result.draft.items[0]?.date, "2026-06-29");
  assert.equal(result.draft.items[1]?.date, "2026-06-30");
  assert.equal(result.draft.items[1]?.startTime, "14:00");
  assert.equal(result.draft.items[1]?.endTime, "17:00");
  assert.equal(result.draft.items[2]?.date, "2026-06-30");
});

test("reviseScheduleDraft removes matched item only when user asks to remove it", () => {
  const result = reviseScheduleDraft({
    draft: baseDraft(),
    userMessage: "删除“复盘总结”这个日程项",
  });

  assert.equal(result.needsClarification, false);
  assert.deepEqual(result.draft.items.map((item) => item.title), ["修复登录页", "部署验证"]);
  assert.equal(result.appliedActions[0]?.type, "remove_item");
});

test("reviseScheduleDraft sets allow-overlap policy without changing item times", () => {
  const draft = baseDraft();
  const result = reviseScheduleDraft({
    draft,
    userMessage: "允许重叠，冲突也没关系",
  });

  assert.equal(result.needsClarification, false);
  assert.equal(result.appliedActions[0]?.type, "set_conflict_policy");
  assert.equal(result.appliedActions[0]?.type === "set_conflict_policy" ? result.appliedActions[0].conflictPolicy : null, "allow-overlap");
  assert.deepEqual(result.draft.items, draft.items);
  assert.ok(result.draft.assumptions?.some((item) => /允许重叠/.test(item)));
});

test("auto reschedule request records a note and does not modify draft", () => {
  const draft = baseDraft();
  const result = reviseScheduleDraft({
    draft,
    userMessage: "帮我自动重新安排避开冲突",
  });

  assert.equal(result.needsClarification, false);
  assert.deepEqual(result.draft.items, draft.items);
  assert.equal(result.appliedActions[0]?.type, "note");
  assert.match(result.summary, /自动寻找空闲时间将在后续阶段实现/);
});

test("missing item target asks for clarification", () => {
  const result = reviseScheduleDraft({
    draft: baseDraft(),
    userMessage: "把“上线演练”改到明天上午",
  });

  assert.equal(result.needsClarification, true);
  assert.match(result.clarificationQuestions?.[0] ?? "", /没有找到|具体是哪一个/);
});

test("duplicate matched item asks for clarification", () => {
  const draft = baseDraft();
  draft.items.push({ ...draft.items[1]!, sourceChecklistItemKey: "item-docs-2" });
  const result = reviseScheduleDraft({
    draft,
    userMessage: "把“部署验证”改到明天上午",
  });

  assert.equal(result.needsClarification, true);
  assert.match(result.clarificationQuestions?.[0] ?? "", /多个|第几个/);
});

test("unparseable time asks for clarification", () => {
  const result = reviseScheduleDraft({
    draft: baseDraft(),
    userMessage: "把“部署验证”改到方便的时候",
  });

  assert.equal(result.needsClarification, true);
  assert.match(result.clarificationQuestions?.[0] ?? "", /日期或时间/);
});

test("reviseScheduleDraft does not mutate input draft", () => {
  const draft = baseDraft();
  const snapshot = structuredClone(draft);

  reviseScheduleDraft({
    conflicts: [conflictFor("部署验证")],
    draft,
    referenceDate: "2026-06-29T00:00:00.000+08:00",
    userMessage: "把冲突的改到明天下午",
  });

  assert.deepEqual(draft, snapshot);
});
