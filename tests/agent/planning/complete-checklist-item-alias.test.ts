import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { runDryRunAndProposeStep } from "../../../src/lib/agent/chat-pipeline/dry-run-and-propose-step";
import { isAgentWriteIntent } from "../../../src/lib/agent/intent/write-intents";
import { evaluatePolicyGuard } from "../../../src/lib/agent/policy/tool-gate";
import { normalizeRouterOutput } from "../../../src/lib/agent/router/normalize-router-output";
import { dryRunAgentIntent } from "../../../src/lib/agent/safety";
import {
  parseAgentIntentResult,
  type AgentChatResponse,
  type AgentIntent,
  type AgentTraceStep,
  type PendingAction,
} from "../../../src/lib/agent/schemas";
import type { AgentPromptContext } from "../../../src/lib/agent/prompts";
import type { AgentThread } from "../../../src/payload-types";
import {
  resetPayloadStub,
  setPayloadStubFindHandler,
} from "../../stubs/payload-client";

const fakeChecklist = {
  createdAt: "2026-06-01T00:00:00.000Z",
  groups: [
    {
      items: [
        {
          completedAt: null,
          completionNote: null,
          id: "item-login",
          isCompleted: false,
          title: "登录页修复",
        },
      ],
      title: "修复阶段",
    },
  ],
  id: 301,
  slug: "release-checklist",
  status: "draft",
  title: "SunnyPanel 发布清单",
  updatedAt: "2026-06-01T00:00:00.000Z",
  visibility: "private",
};

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
  now: "2026-06-29T20:00:00.000+08:00",
  pendingAction: null,
  plans: [],
};

const makeThread = (pendingAction: null | PendingAction = null): AgentThread => ({
  id: 9401,
  messages: [],
  pendingAction,
} as unknown as AgentThread);

beforeEach(() => {
  resetPayloadStub();
});

const stubChecklistResolverPayload = () => {
  setPayloadStubFindHandler(async (input) => {
    const args = input as { collection?: string };

    if (args.collection === "checklists") {
      return {
        docs: [fakeChecklist],
        totalDocs: 1,
      };
    }

    if (args.collection === "timeline-events") {
      return {
        docs: [],
        totalDocs: 0,
      };
    }

    return {
      docs: [],
      totalDocs: 0,
    };
  });
};

const parseAliasIntent = () =>
  parseAgentIntentResult({
    args: {
      checklistTitle: "SunnyPanel 发布清单",
      completedAt: "2026-06-29T20:30:00.000+08:00",
      completionNote: "登录页修复已验收。",
      groupTitle: "修复阶段",
      itemTitle: "登录页修复",
    },
    confidence: 0.91,
    intent: "complete_checklist_item",
  });

test("complete_checklist_item alias parses into the existing write intent", () => {
  const intent = parseAliasIntent();

  assert.ok(intent);
  assert.equal(intent.intent, "complete_plan_item");
  assert.equal(isAgentWriteIntent(intent.intent), true);
  assert.equal(intent.args.checklistTitle, "SunnyPanel 发布清单");
  assert.equal(intent.args.groupTitle, "修复阶段");
  assert.equal(intent.args.itemTitle, "登录页修复");
  assert.equal(intent.args.completionNote, "登录页修复已验收。");
});

test("complete_checklist_item alias goes through Policy Guard as an update write", () => {
  const intent = parseAliasIntent();
  assert.ok(intent);

  const routerOutput = normalizeRouterOutput({ intent });
  const policy = evaluatePolicyGuard(routerOutput, {
    userContext: {
      userId: 1,
    },
  });

  assert.equal(routerOutput.action, "update");
  assert.equal(policy.allowed, true);
  assert.ok(policy.allowedTools.length > 0);
  assert.deepEqual(policy.plannedTools, ["complete_plan_item"]);
});

test("complete_checklist_item alias reuses completePlanItem dry-run with checklist-item wording", async () => {
  const intent = parseAliasIntent();
  assert.ok(intent);

  const result = await dryRunAgentIntent(intent, {
    createActionId: () => "complete-checklist-item-alias-action",
    findTimelineEvent: async () => null,
    resolveChecklistItem: async () => ({
      question: null,
      resolved: {
        checklist: fakeChecklist as never,
        group: fakeChecklist.groups[0] as never,
        groupIndex: 0,
        item: fakeChecklist.groups[0].items[0] as never,
        itemIndex: 0,
      },
    }),
  });

  assert.equal(result.type, "proposed_action");
  if (result.type !== "proposed_action") assert.fail("expected proposed action");
  assert.equal(result.action.intent, "complete_plan_item");
  assert.equal(result.action.requiresConfirmation, true);
  assert.equal(result.action.riskLevel, "high");
  assert.match(result.action.summary, /清单条目|清单项/);
  assert.doesNotMatch(result.action.summary, /计划项/);
  assert.equal(
    result.action.changes.some((change) => change.collection === "timeline-events" && change.timelineAffected),
    true,
  );
});

test("complete_checklist_item alias creates pending confirmation before execute", async () => {
  const intent = parseAliasIntent();
  assert.ok(intent);

  stubChecklistResolverPayload();
  let persistedPendingAction: null | PendingAction = null;
  const trace: AgentTraceStep[] = [];
  const result = await runDryRunAndProposeStep({
    confirmedActionId: null,
    context,
    emitStatus: () => undefined,
    emitToken: () => undefined,
    payload: {} as never,
    persistAgentTurn: async ({ nextPendingAction }) => {
      persistedPendingAction = nextPendingAction;

      return makeThread(nextPendingAction);
    },
    pushTrace: (step) => trace.push(step),
    resolution: {
      engine: "heuristic",
      intent,
    },
    tokenUsage,
    trace,
    user: { id: 1 },
    userPreferences: null,
  });

  assert.equal(result.outcome, "early_exit");
  const pendingAction = result.response.pendingAction;
  assert.equal(pendingAction?.type, "await_confirmation");
  assert.equal(persistedPendingAction, pendingAction);
  if (pendingAction?.type !== "await_confirmation") assert.fail("expected pending confirmation");
  assert.equal(pendingAction.action.intent, "complete_plan_item");
  assert.match(pendingAction.action.summary, /清单条目|清单项/);
});

test("complete_plan_item legacy intent remains supported", async () => {
  const intent: AgentIntent = {
    args: {
      checklistTitle: "SunnyPanel 发布清单",
      completedAt: null,
      completionNote: null,
      groupTitle: "修复阶段",
      itemTitle: "登录页修复",
    },
    intent: "complete_plan_item",
  };

  const result = await dryRunAgentIntent(intent, {
    createActionId: () => "complete-plan-item-legacy-action",
    findTimelineEvent: async () => null,
    resolveChecklistItem: async () => ({
      question: null,
      resolved: {
        checklist: fakeChecklist as never,
        group: fakeChecklist.groups[0] as never,
        groupIndex: 0,
        item: fakeChecklist.groups[0].items[0] as never,
        itemIndex: 0,
      },
    }),
  });

  assert.equal(result.type, "proposed_action");
  if (result.type !== "proposed_action") assert.fail("expected proposed action");
  assert.equal(result.action.intent, "complete_plan_item");
  assert.equal(result.action.requiresConfirmation, true);
});
