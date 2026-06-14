import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { parseComposeScheduleItemIntent } from "../../src/lib/agent/intent/heuristics/plan-schedule";
import { dryRunAgentIntent } from "../../src/lib/agent/safety";
import type { AgentToolDryRunContext } from "../../src/lib/agent/tool-registry";
import { composeScheduleProposal, composeScheduleProposalAsync } from "../../src/lib/agent/workflows/schedule-composer";
import { parseScheduleResultMessage } from "../../src/components/dashboard/agent/utils";

const userMessage = "今天晚上五点钟创建日程，上产品经理课程";
const fixedNow = "2026-06-08T04:00:00.000Z";

const dryRunContext: AgentToolDryRunContext = {
  createActionId: () => "evening-schedule-action",
  detectScheduleConflicts: async () => [],
  findTimelineEvent: async () => null,
  now: fixedNow,
  planCandidates: [],
  resolveChecklistGroupForAppend: async () => ({
    question: null,
    resolved: null,
  }),
  resolveChecklistItem: async () => ({
    question: null,
    resolved: null,
  }),
};

test("evening course prompt resolves to compose_schedule_item intent", () => {
  const intent = parseComposeScheduleItemIntent(userMessage);

  assert.ok(intent);
  assert.equal(intent?.intent, "compose_schedule_item");
  assert.equal(intent?.args.sourceText, userMessage);
});

test("evening course prompt composes 17:00 schedule today even when LLM args carry 09:00-10:30", async () => {
  const intent = parseComposeScheduleItemIntent(userMessage);

  assert.ok(intent);

  const proposal = await composeScheduleProposalAsync(
    {
      sourceText: userMessage,
      endTime: "10:30",
      startTime: "09:00",
    },
    { now: fixedNow },
  );

  assert.equal(proposal.date, "2026-06-08");
  assert.equal(proposal.startTime, "17:00");
  assert.equal(proposal.endTime, "18:30");
  assert.equal(proposal.title, "产品经理课程");
});

test("evening course dry-run produces confirmable schedule proposal snapshot", async () => {
  const result = await dryRunAgentIntent(
    {
      args: {
        endTime: "10:30",
        sourceText: userMessage,
        startTime: "09:00",
      },
      intent: "compose_schedule_item",
    },
    dryRunContext,
  );

  assert.equal(result.type, "proposed_action");

  if (result.type !== "proposed_action") {
    return;
  }

  const snapshot = result.action.afterSnapshot as {
    date?: string;
    endTime?: string;
    startTime?: string;
    title?: string;
  };

  assert.equal(snapshot.date, "2026-06-08");
  assert.equal(snapshot.startTime, "17:00");
  assert.equal(snapshot.endTime, "18:30");
  assert.match(snapshot.title ?? "", /产品经理课程/);
  assert.match(result.action.changes[0]?.afterPreview ?? "", /17:00-18:30/);
});

test("schedule creation assistant message renders Dashboard schedule result card", () => {
  const proposal = composeScheduleProposal(
    {
      sourceText: userMessage,
    },
    { now: fixedNow },
  );

  const assistantMessage = `已创建日程「${proposal.title}」：${proposal.date} ${proposal.startTime}-${proposal.endTime}。`;
  const parsed = parseScheduleResultMessage(assistantMessage);

  assert.deepEqual(parsed, {
    date: "2026-06-08",
    timeRange: "17:00-18:30",
    title: "产品经理课程",
  });
});

test("Dashboard schedule result card and message card wire schedule UI", () => {
  const read = (relativePath: string) => readFileSync(relativePath, "utf8");

  const messageCard = read("src/components/dashboard/agent/MessageCard.tsx");
  const scheduleCard = read("src/components/dashboard/agent/ScheduleResultCard.tsx");

  assert.match(messageCard, /parseScheduleResultMessage/);
  assert.match(messageCard, /ScheduleResultCard/);
  assert.match(messageCard, /structuredCard\.data/);
  assert.match(scheduleCard, /aria-label="日程创建结果"/);
  assert.match(scheduleCard, /已创建日程/);
  assert.match(scheduleCard, /查看日程/);
  assert.match(scheduleCard, /result\.timeRange/);
});
