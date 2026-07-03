import assert from "node:assert/strict";
import { test } from "node:test";

import { runDryRunAndProposeStep } from "../../../src/lib/agent/chat-pipeline/dry-run-and-propose-step";
import type { AgentChatResponse, AgentIntent, AgentTraceStep, PendingAction } from "../../../src/lib/agent/schemas";
import type { AgentPromptContext } from "../../../src/lib/agent/prompts";
import type { AgentThread } from "../../../src/payload-types";

const tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]> = {
  contextTokens: 4,
  inputTokens: 2,
  outputTokens: 0,
  providerInputTokens: 0,
  providerOutputTokens: 0,
  source: "estimate",
  totalTokens: 6,
};

const context: AgentPromptContext = {
  checklists: [],
  now: "2026-06-29T00:00:00.000+08:00",
  pendingAction: null,
  plans: [],
};

const createScheduleItemsIntent: Extract<AgentIntent, { intent: "create_schedule_items" }> = {
  args: {
    items: [
      {
        date: "2026-06-29",
        endTime: "22:00",
        isAllDay: false,
        startTime: "20:00",
        title: "修复登录页",
      },
    ],
    sourceText: "从日程草案准备创建正式日程。",
    sourceType: "manual",
    title: "日程草案：1 项任务",
  },
  confidence: 0.92,
  intent: "create_schedule_items",
};

const makeThread = (pendingAction: null | PendingAction): AgentThread => ({
  id: 992,
  messages: [],
  pendingAction,
} as unknown as AgentThread);

test("create_schedule_items dry-run step creates await_confirmation pending action", async () => {
  const persistedPendingActions: PendingAction[] = [];
  const trace: AgentTraceStep[] = [];
  const turnAudit = {};

  const result = await runDryRunAndProposeStep({
    confirmedActionId: null,
    context,
    conversationState: null,
    emitStatus: () => undefined,
    emitToken: () => undefined,
    payload: {} as never,
    persistAgentTurn: async ({ nextPendingAction }) => {
      if (nextPendingAction) persistedPendingActions.push(nextPendingAction);
      return makeThread(nextPendingAction);
    },
    pushTrace: (step) => {
      trace.push(step);
    },
    resolution: {
      engine: "heuristic",
      intent: createScheduleItemsIntent,
    },
    tokenUsage,
    trace,
    turnAudit: turnAudit as never,
    user: { id: 1 },
  });

  assert.equal(result.outcome, "early_exit");
  if (result.outcome !== "early_exit") assert.fail("expected early exit pending confirmation");
  assert.equal(result.response.pendingAction?.type, "await_confirmation");
  assert.equal(result.response.pendingAction?.action.intent, "create_schedule_items");
  assert.deepEqual(result.response.pendingAction?.action.args, createScheduleItemsIntent.args);
  assert.equal(persistedPendingActions.length, 1);
  assert.equal(persistedPendingActions[0]?.type, "await_confirmation");
  assert.ok(trace.some((step) => step.id === "action-dry-run"));
  assert.match(JSON.stringify(turnAudit), /Policy Guard/);
  assert.match(result.response.assistantMessage, /确认|执行|写入/);
});
