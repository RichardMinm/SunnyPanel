import assert from "node:assert/strict";
import { test } from "node:test";

import {
  composeScheduleProposal,
  inferScheduleDate,
} from "../../src/lib/agent/workflows/schedule-composer";

const fixedNow = "2026-06-08T04:00:00.000Z";

// ─── Date inference ───

test("inferScheduleDate: 今天 → current date", () => {
  assert.equal(inferScheduleDate("今天下午开会", fixedNow), "2026-06-08");
  assert.equal(inferScheduleDate("今天晚上五点钟创建日程", fixedNow), "2026-06-08");
  assert.equal(inferScheduleDate("今日安排复习", fixedNow), "2026-06-08");
  assert.equal(inferScheduleDate("今晚学习", fixedNow), "2026-06-08");
  assert.equal(inferScheduleDate("上午九点开会", fixedNow), "2026-06-08");
});

test("inferScheduleDate: 明天 → next day", () => {
  assert.equal(inferScheduleDate("明天早上八点跑步", fixedNow), "2026-06-09");
  assert.equal(inferScheduleDate("明早八点跑步", fixedNow), "2026-06-09");
  assert.equal(inferScheduleDate("明晚学习", fixedNow), "2026-06-09");
});

test("inferScheduleDate: 后天 → day after tomorrow", () => {
  assert.equal(inferScheduleDate("后天下午开会", fixedNow), "2026-06-10");
});

test("inferScheduleDate: explicit date formats", () => {
  assert.equal(inferScheduleDate("2026-06-15 开会", fixedNow), "2026-06-15");
  assert.equal(inferScheduleDate("2026年6月15日 开会", fixedNow), "2026-06-15");
  assert.equal(inferScheduleDate("2026/06/15 开会", fixedNow), "2026-06-15");
});

test("inferScheduleDate: weekday references", () => {
  // June 8, 2026 is a Monday. Next Tuesday = June 9.
  assert.equal(inferScheduleDate("周二开会", fixedNow), "2026-06-09");
  assert.equal(inferScheduleDate("周二", fixedNow), "2026-06-09");
});

test("inferScheduleDate: no date expression → null", () => {
  assert.equal(inferScheduleDate("学习产品经理课程", fixedNow), null);
  assert.equal(inferScheduleDate("", fixedNow), null);
});

// ─── Time inference ───

test("composeScheduleProposal: 早上八点 → 08:00-09:30", () => {
  const proposal = composeScheduleProposal(
    { sourceText: "明天早上八点上产品经理课程" },
    { now: fixedNow },
  );

  assert.equal(proposal.date, "2026-06-09");
  assert.equal(proposal.startTime, "08:00");
  assert.equal(proposal.endTime, "09:30");
});

test("composeScheduleProposal: 下午三点 → 15:00-16:30", () => {
  const proposal = composeScheduleProposal(
    { sourceText: "今天下午三点上产品经理课程" },
    { now: fixedNow },
  );

  assert.equal(proposal.date, "2026-06-08");
  assert.equal(proposal.startTime, "15:00");
  assert.equal(proposal.endTime, "16:30");
});

test("composeScheduleProposal: 晚上七点 → 19:00-20:30", () => {
  const proposal = composeScheduleProposal(
    { sourceText: "今天晚上七点上产品经理课程" },
    { now: fixedNow },
  );

  assert.equal(proposal.startTime, "19:00");
  assert.equal(proposal.endTime, "20:30");
});

test("composeScheduleProposal: explicit time 14:30 → 14:30-16:00", () => {
  const proposal = composeScheduleProposal(
    { sourceText: "今天14:30上产品经理课程" },
    { now: fixedNow },
  );

  assert.equal(proposal.startTime, "14:30");
  assert.equal(proposal.endTime, "16:00");
});

test("composeScheduleProposal: with duration 1小时 → 17:00-18:00", () => {
  const proposal = composeScheduleProposal(
    { sourceText: "今天晚上五点上产品经理课程，1小时" },
    { now: fixedNow },
  );

  assert.equal(proposal.startTime, "17:00");
  assert.equal(proposal.endTime, "18:00");
});

test("composeScheduleProposal: with duration 2小时 → 17:00-19:00", () => {
  const proposal = composeScheduleProposal(
    { sourceText: "今天晚上五点上产品经理课程，2个小时" },
    { now: fixedNow },
  );

  assert.equal(proposal.startTime, "17:00");
  assert.equal(proposal.endTime, "19:00");
});

test("composeScheduleProposal: with duration in minutes → 17:00-17:30", () => {
  const proposal = composeScheduleProposal(
    { sourceText: "今天晚上五点上产品经理课程，30分钟" },
    { now: fixedNow },
  );

  assert.equal(proposal.startTime, "17:00");
  assert.equal(proposal.endTime, "17:30");
});

// ─── Title inference ───

test("composeScheduleProposal: infers title from source when no explicit title", () => {
  const proposal = composeScheduleProposal(
    { sourceText: "明天下午复习高等数学第三章" },
    { now: fixedNow },
  );

  assert.equal(proposal.title, "复习高等数学第三章");
});

test("composeScheduleProposal: uses explicit title when provided", () => {
  const proposal = composeScheduleProposal(
    { sourceText: "今天晚上学习", title: "产品经理课程" },
    { now: fixedNow },
  );

  assert.equal(proposal.title, "产品经理课程");
});

// ─── All-day events ───

test("composeScheduleProposal: 全天 event via isAllDay flag", () => {
  const proposal = composeScheduleProposal(
    { sourceText: "明天全天产品经理课程培训", isAllDay: true },
    { now: fixedNow },
  );

  assert.equal(proposal.isAllDay, true);
  assert.equal(proposal.startTime, null);
  assert.equal(proposal.endTime, null);
});

test("composeScheduleProposal: 全天 keyword in source text", () => {
  const proposal = composeScheduleProposal(
    { sourceText: "明天全天产品经理课程培训" },
    { now: fixedNow },
  );

  assert.equal(proposal.isAllDay, true);
  assert.equal(proposal.startTime, null);
  assert.equal(proposal.endTime, null);
});

// ─── Priority inference ───

test("composeScheduleProposal: high priority from 紧急 keyword", () => {
  const proposal = composeScheduleProposal(
    { sourceText: "今天晚上紧急复习产品经理课程" },
    { now: fixedNow },
  );

  assert.equal(proposal.priority, "high");
});

test("composeScheduleProposal: default priority is medium", () => {
  const proposal = composeScheduleProposal(
    { sourceText: "今天晚上学习产品经理课程" },
    { now: fixedNow },
  );

  assert.equal(proposal.priority, "medium");
});
