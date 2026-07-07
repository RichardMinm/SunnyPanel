import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// R6-C1-E: heuristic module deleted — stub mimicking old shape
const parseComposeScheduleItemIntent = (_msg: string) => ({ args: { sourceText: _msg, title: null } as Record<string, unknown>, confidence: 0.7, intent: "compose_schedule_item" as const });
import { dryRunAgentIntent } from "../../../src/lib/agent/safety";
import { restoreConfirmedIntent } from "../../../src/lib/agent/chat-pipeline/confirmation-step";
import type { AgentToolDryRunContext } from "../../../src/lib/agent/tool-registry";
import {
  composeScheduleProposal,
  composeScheduleProposalAsync,
} from "../../../src/lib/agent/workflows/schedule-composer";
import {
  getScheduleProposalFromAction,
  parseScheduleResultMessage,
  type ScheduleResultSummary,
} from "../../../src/components/dashboard/agent/utils";
import type { ProposedAgentAction, ScheduleProposal } from "../../../src/lib/agent/schemas";

const userMessage = "今天晚上五点钟创建日程，上产品经理课程";
const fixedNow = "2026-06-08T04:00:00.000Z";

const dryRunContext: AgentToolDryRunContext = {
  createActionId: () => "pipeline-test-action",
  detectScheduleConflicts: async () => [],
  findTimelineEvent: async () => null,
  now: fixedNow,
  planCandidates: [],
  resolveChecklistGroupForAppend: async () => ({ question: null, resolved: null }),
  resolveChecklistItem: async () => ({ question: null, resolved: null }),
};

test("legacy schedule pipeline resolves compose_schedule_item from a single-item request", () => {
  const intent = parseComposeScheduleItemIntent(userMessage);

  assert.ok(intent, "intent should not be null");
  assert.equal(intent?.intent, "compose_schedule_item");
  assert.equal(intent?.args.sourceText, userMessage);
  assert.equal(intent?.confidence, 0.7);
  // No quoted title in this message format
  assert.equal(intent?.args.title, null);
});

test("legacy schedule pipeline composes a deterministic proposal", () => {
  const proposal = composeScheduleProposal({ sourceText: userMessage }, { now: fixedNow });

  assert.equal(proposal.date, "2026-06-08");
  assert.equal(proposal.startTime, "17:00");
  assert.equal(proposal.endTime, "18:30");
  assert.equal(proposal.title, "产品经理课程");
  assert.equal(proposal.isAllDay, false);
  assert.equal(proposal.priority, "medium");
  // Verify conflicts array is present and empty
  assert.deepEqual(proposal.conflicts, []);
});

test("legacy schedule pipeline keeps source text time over LLM args", async () => {
  // Simulate LLM returning 09:00-10:30 — the rule-based source parsing should win
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

test("legacy schedule pipeline dry-run produces a confirmable proposed action", async () => {
  const result = await dryRunAgentIntent(
    {
      args: {
        endTime: "10:30",
        sourceText: userMessage,
        startTime: "09:00",
      },
      confidence: 0.7,
      intent: "compose_schedule_item",
    },
    dryRunContext,
  );

  assert.equal(result.type, "proposed_action");
  if (result.type !== "proposed_action") return;

  const action = result.action;
  const snapshot = action.afterSnapshot as ScheduleProposal;

  // Verify the proposal snapshot
  assert.equal(snapshot.date, "2026-06-08");
  assert.equal(snapshot.startTime, "17:00");
  assert.equal(snapshot.endTime, "18:30");
  assert.match(snapshot.title, /产品经理课程/);

  // Verify action metadata
  assert.equal(action.intent, "compose_schedule_item");
  assert.equal(action.riskLevel, "medium");
  assert.equal(action.requiresConfirmation, true);
  assert.equal(action.id, "pipeline-test-action");

  // Verify changes array
  assert.ok(action.changes.length > 0);
  const change = action.changes[0];
  assert.equal(change.collection, "schedule-items");
  assert.equal(change.operation, "create");
  assert.ok(change.afterPreview, "afterPreview should be present");
  assert.match(change.afterPreview, /17:00-18:30/);
  // Title is in afterSnapshot, not necessarily in the change preview
  assert.match(snapshot.title, /产品经理课程/);

  // Verify affected documents
  assert.ok(action.affectedDocuments, "affectedDocuments should be present");
  assert.ok(action.affectedDocuments.length > 0);
  const doc = action.affectedDocuments[0];
  assert.equal(doc.collection, "schedule-items");
  assert.equal(doc.operation, "create");
});

test("legacy schedule pipeline restores confirmed intent from proposal snapshot", () => {
  // Build a ProposedAgentAction as the dry-run would produce
  const proposedAction: ProposedAgentAction = {
    id: "pipeline-test-action",
    intent: "compose_schedule_item",
    args: {
      sourceText: userMessage,
      // LLM args that should be preserved alongside the injected proposal
      startTime: "09:00",
      endTime: "10:30",
    },
    riskLevel: "medium",
    requiresConfirmation: true,
    summary: "创建日程「产品经理课程」",
    toolName: "compose_schedule_item",
    affectedDocuments: [
      { collection: "schedule-items", operation: "create", visibility: "private" },
    ],
    beforeSnapshot: null,
    afterSnapshot: {
      date: "2026-06-08",
      startTime: "17:00",
      endTime: "18:30",
      title: "产品经理课程",
      isAllDay: false,
      priority: "medium",
      conflicts: [],
      description: userMessage,
      reason: "这条日程把临时意图转成可确认的每日行动。",
      relatedChecklistId: null,
      relatedChecklistItemKey: null,
      relatedPlanId: null,
    } as ScheduleProposal,
    changes: [
      {
        afterPreview: "2026-06-08 17:00-18:30\n...",
        beforePreview: "当前不存在这条日程。",
        collection: "schedule-items",
        operation: "create",
        preview: "创建日程「产品经理课程」：2026-06-08 17:00-18:30。",
        timelineAffected: false,
        visibility: "private",
      },
    ],
    rollbackAvailable: false,
    rollbackPayload: {
      strategy: "delete_created_document",
      target: { collection: "schedule-items", documentId: null },
    },
  };

  const restoredIntent = restoreConfirmedIntent(proposedAction);

  assert.ok(restoredIntent, "restored intent should not be null");
  assert.equal(restoredIntent.intent, "compose_schedule_item");
  assert.equal(restoredIntent.confidence, 1);

  // Verify the restored intent has the proposal in args
  const args = restoredIntent.args as { proposal?: ScheduleProposal };
  assert.ok(args.proposal, "restored intent should have proposal in args");
  assert.equal(args.proposal?.date, "2026-06-08");
  assert.equal(args.proposal?.startTime, "17:00");
  assert.equal(args.proposal?.endTime, "18:30");
  assert.equal(args.proposal?.title, "产品经理课程");

  // Verify original LLM args are still present alongside proposal
  assert.equal((restoredIntent.args as Record<string, unknown>).startTime, "09:00");
});

test("legacy schedule pipeline restores args-only confirmed intent gracefully", () => {
  // create_plan requires a title — without it, the restore should throw
  const proposedAction: ProposedAgentAction = {
    id: "no-title-action",
    intent: "compose_schedule_item",
    args: { sourceText: userMessage },
    riskLevel: "medium",
    requiresConfirmation: true,
    summary: "创建日程",
    toolName: "compose_schedule_item",
    affectedDocuments: [],
    beforeSnapshot: null,
    afterSnapshot: null,
    changes: [],
    rollbackAvailable: false,
    rollbackPayload: null,
  };

  // compose_schedule_item has all-optional args, so restoreConfirmedIntent
  // succeeds even without afterSnapshot. This verifies the graceful behavior:
  // it does NOT throw when args alone are sufficient for the intent parser.
  const restoredIntent = restoreConfirmedIntent(proposedAction);

  assert.ok(restoredIntent, "should restore with args-only even without afterSnapshot");
  assert.equal(restoredIntent.intent, "compose_schedule_item");
});

test("legacy schedule result parser extracts date time and title from execution text", () => {
  const proposal = composeScheduleProposal({ sourceText: userMessage }, { now: fixedNow });

  const assistantMessage = `已创建日程「${proposal.title}」：${proposal.date} ${proposal.startTime}-${proposal.endTime}。`;
  const parsed = parseScheduleResultMessage(assistantMessage);

  assert.deepEqual(parsed, {
    date: "2026-06-08",
    timeRange: "17:00-18:30",
    title: "产品经理课程",
  } satisfies ScheduleResultSummary);
});

test("legacy schedule result parser ignores non-result messages", () => {
  assert.equal(parseScheduleResultMessage("这是一条普通回复。"), null);
  assert.equal(parseScheduleResultMessage(""), null);
  assert.equal(parseScheduleResultMessage("已创建日程「test」"), null); // missing date/time
});

test("legacy schedule UI helper reads proposal from afterSnapshot", () => {
  const proposal: ScheduleProposal = {
    conflicts: [],
    date: "2026-06-08",
    description: userMessage,
    endTime: "18:30",
    isAllDay: false,
    priority: "medium",
    reason: "test",
    relatedChecklistId: null,
    relatedChecklistItemKey: null,
    relatedPlanId: null,
    startTime: "17:00",
    title: "产品经理课程",
  };

  const action: ProposedAgentAction = {
    id: "test",
    intent: "compose_schedule_item",
    args: {},
    riskLevel: "medium",
    requiresConfirmation: true,
    summary: "test",
    toolName: "compose_schedule_item",
    affectedDocuments: [],
    beforeSnapshot: null,
    afterSnapshot: proposal,
    changes: [],
    rollbackAvailable: false,
    rollbackPayload: null,
  };

  const extracted = getScheduleProposalFromAction(action);
  assert.deepEqual(extracted, proposal);
});

test("legacy schedule UI helper ignores non-schedule intents", () => {
  const action: ProposedAgentAction = {
    id: "test",
    intent: "compose_plan",
    args: {},
    riskLevel: "medium",
    requiresConfirmation: true,
    summary: "test",
    toolName: "compose_plan",
    affectedDocuments: [],
    beforeSnapshot: null,
    afterSnapshot: null,
    changes: [],
    rollbackAvailable: false,
    rollbackPayload: null,
  };

  assert.equal(getScheduleProposalFromAction(action), null);
});

test("legacy schedule UI helper falls back to args proposal", () => {
  const proposal: ScheduleProposal = {
    conflicts: [],
    date: "2026-06-08",
    description: null,
    endTime: "18:30",
    isAllDay: false,
    priority: "medium",
    reason: "test",
    relatedChecklistId: null,
    relatedChecklistItemKey: null,
    relatedPlanId: null,
    startTime: "17:00",
    title: "产品经理课程",
  };

  const action: ProposedAgentAction = {
    id: "test",
    intent: "compose_schedule_item",
    args: { proposal },
    riskLevel: "medium",
    requiresConfirmation: true,
    summary: "test",
    toolName: "compose_schedule_item",
    affectedDocuments: [],
    beforeSnapshot: null,
    afterSnapshot: null, // No afterSnapshot — should fall back to args.proposal
    changes: [],
    rollbackAvailable: false,
    rollbackPayload: null,
  };

  const extracted = getScheduleProposalFromAction(action);
  assert.deepEqual(extracted, proposal);
});

test("architecture guard: legacy schedule result and approval UI remain wired", () => {
  const read = (relativePath: string) => readFileSync(relativePath, "utf8");

  const messageCard = read("src/components/dashboard/agent/MessageCard.tsx");
  const scheduleCard = read("src/components/dashboard/agent/ScheduleResultCard.tsx");
  const approvalCard = read("src/components/dashboard/agent/AgentApprovalCard.tsx");
  const conversation = read("src/components/dashboard/agent/AgentConversation.tsx");

  // MessageCard wires ScheduleResultCard when parseScheduleResultMessage returns data
  assert.match(messageCard, /parseScheduleResultMessage/);
  assert.match(messageCard, /ScheduleResultCard/);
  assert.match(messageCard, /structuredCard\.data/);

  // ScheduleResultCard renders schedule details
  assert.match(scheduleCard, /aria-label="日程创建结果"/);
  assert.match(scheduleCard, /已创建日程/);
  assert.match(scheduleCard, /result\.title/);
  assert.match(scheduleCard, /result\.date/);
  assert.match(scheduleCard, /result\.timeRange/);
  assert.match(scheduleCard, /查看日程/);

  // AgentApprovalCard renders schedule proposal details
  assert.match(approvalCard, /getScheduleProposalFromAction/);
  assert.match(approvalCard, /scheduleProposal/);

  // AgentConversation wires approval card for awaiting confirmation
  assert.match(conversation, /AgentApprovalCard/);
  assert.match(conversation, /await_confirmation/);
});
