import assert from "node:assert/strict";
import test from "node:test";

import { composeScheduleProposal } from "../../src/lib/agent/workflows/schedule-composer";

const eveningCourseSource = "请你为我今天添加日程，晚上五点钟上产品经理课程";
const tonightCourseSource = "今天晚上五点钟创建日程，上产品经理课程";
const fixedNow = "2026-06-08T04:00:00.000Z";

test("composeScheduleProposal parses 晚上五点钟 as 17:00 today", () => {
  const proposal = composeScheduleProposal(
    {
      sourceText: eveningCourseSource,
      title: "产品经理课程",
    },
    { now: fixedNow },
  );

  assert.equal(proposal.date, "2026-06-08");
  assert.equal(proposal.startTime, "17:00");
  assert.equal(proposal.endTime, "18:30");
  assert.equal(proposal.title, "产品经理课程");
});

test("composeScheduleProposal ignores conflicting LLM startTime/endTime when source has explicit time", () => {
  const proposal = composeScheduleProposal(
    {
      endTime: "10:30",
      sourceText: eveningCourseSource,
      startTime: "09:00",
      title: "产品经理课程",
    },
    { now: fixedNow },
  );

  assert.equal(proposal.date, "2026-06-08");
  assert.equal(proposal.startTime, "17:00");
  assert.equal(proposal.endTime, "18:30");
});

test("composeScheduleProposal keeps explicit times when source has no time expression", () => {
  const proposal = composeScheduleProposal(
    {
      date: "2026-06-09",
      endTime: "10:30",
      sourceText: "安排复盘反函数习题",
      startTime: "09:00",
      title: "复盘反函数习题",
    },
    { now: fixedNow },
  );

  assert.equal(proposal.date, "2026-06-09");
  assert.equal(proposal.startTime, "09:00");
  assert.equal(proposal.endTime, "10:30");
});

test("composeScheduleProposal infers 产品经理课程 title from tonight phrasing", () => {
  const proposal = composeScheduleProposal(
    {
      sourceText: tonightCourseSource,
    },
    { now: fixedNow },
  );

  assert.equal(proposal.title, "产品经理课程");
  assert.equal(proposal.startTime, "17:00");
});
