import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveAgentIntent } from "../../src/lib/agent/intent";
import type { AgentPromptContext } from "../../src/lib/agent/prompts";
import {
  buildProposedActionMessage,
  createIntentFromProposedAction,
  createProposedAgentAction,
  getAgentIntentRiskLevel,
} from "../../src/lib/agent/safety";
import type { AgentIntent } from "../../src/lib/agent/schemas";

const context: AgentPromptContext = {
  checklists: [],
  now: "2026-05-06T00:00:00.000+08:00",
  pendingAction: null,
  plans: [],
};

test("low-risk intents do not require confirmation proposals", () => {
  const lowRiskIntents: AgentIntent[] = [
    {
      args: {
        answer: "只回答问题。",
        suggestAction: null,
      },
      intent: "answer_question",
    },
    {
      args: {
        checklistTitle: null,
        scope: "all",
      },
      intent: "query_progress",
    },
    {
      args: {
        planTitle: null,
      },
      intent: "evaluate_plan",
    },
    {
      args: {
        missingFields: ["title"],
        question: "还需要计划标题。",
      },
      intent: "clarify",
    },
  ];

  for (const intent of lowRiskIntents) {
    assert.equal(getAgentIntentRiskLevel(intent.intent), "low");
    assert.equal(createProposedAgentAction(intent), null);
  }
});

test("medium-risk write intents are converted into confirmation proposals", () => {
  const createPlanIntent: AgentIntent = {
    args: {
      title: "整理计算机组成原理复习路径",
    },
    intent: "create_plan",
  };
  const appendItemIntent: AgentIntent = {
    args: {
      checklistTitle: "高等数学",
      description: null,
      groupTitle: "映射与函数",
      itemTitle: "反函数习题复盘",
    },
    intent: "append_plan_item",
  };

  const createProposal = createProposedAgentAction(createPlanIntent);
  const appendProposal = createProposedAgentAction(appendItemIntent);

  assert.ok(createProposal);
  assert.ok(appendProposal);
  assert.equal(createProposal.riskLevel, "medium");
  assert.equal(appendProposal.riskLevel, "medium");
  assert.equal(createProposal.changes[0]?.collection, "plans");
  assert.equal(appendProposal.changes[0]?.collection, "checklists");
  assert.match(buildProposedActionMessage(createProposal), /风险等级：中风险/);
});

test("high-risk completion intents include timeline impact and can be restored after confirmation", () => {
  const completionIntent: AgentIntent = {
    args: {
      checklistTitle: "高等数学",
      completedAt: null,
      completionNote: null,
      groupTitle: "映射与函数",
      itemTitle: "反函数习题",
    },
    intent: "complete_plan_item",
  };
  const proposal = createProposedAgentAction(completionIntent);

  assert.ok(proposal);
  assert.equal(proposal.riskLevel, "high");
  assert.equal(proposal.changes.some((change) => change.collection === "timeline-events"), true);

  const restoredIntent = createIntentFromProposedAction(proposal);

  assert.equal(restoredIntent?.intent, "complete_plan_item");
  assert.deepEqual(restoredIntent?.args, completionIntent.args);
});

test("destructive requests are clarified and never converted into proposed actions", async () => {
  const result = await resolveAgentIntent({
    context,
    history: [],
    message: "把所有内容删掉",
    modelResolver: async () => null,
    pendingAction: null,
  });

  assert.equal(result.intent.intent, "clarify");
  assert.equal(createProposedAgentAction(result.intent), null);
});
