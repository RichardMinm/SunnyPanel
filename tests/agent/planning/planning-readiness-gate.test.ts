/**
 * [R6-B LEGACY HEURISTIC QUARANTINE]
 *
 * This test covers the pre-LLM Tool Planner heuristic business fallback path.
 * It is NOT part of the AGENT_REQUIRE_LLM=1 protected baseline.
 * Keep temporarily for AGENT_REQUIRE_LLM=0 legacy mode compatibility.
 * Do NOT delete until: Tool Planner replacement exists AND legacy mode is retired.
 * See: docs/phase-r6b-legacy-heuristic-test-quarantine.md
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { MemorySaver } from "@langchain/langgraph";

import {
  evaluatePlanReadinessGate,
  extractPlanReadinessSlotsFromIntent,
  isPlanReadinessGateIntent,
} from "../../../src/lib/agent/planning/readiness-gate";
import { createRunFullLangGraphAgentChatPipeline, type FullLangGraphAdapterSteps } from "../../../src/lib/agent/langgraph/full-adapter";
import type { AgentPromptContext } from "../../../src/lib/agent/prompts";
import type {
  AgentChatResponse,
  AgentIntent,
  AgentTraceStep,
  PendingAction,
  ProposedAgentAction,
} from "../../../src/lib/agent/schemas";
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

const makeThread = (): AgentThread => ({
  id: 920,
  messages: [],
  pendingAction: null,
} as unknown as AgentThread);

const makeConfirmationAction = (intent: AgentIntent["intent"]): ProposedAgentAction => ({
  args: { sourceText: "创建小型计划" },
  changes: [
    {
      collection: "plans",
      operation: "create",
      preview: "创建小型计划",
    },
  ],
  id: "action-plan-gate-test",
  intent,
  requiresConfirmation: true,
  riskLevel: "medium",
  summary: "创建小型计划",
});

test("readiness gate applies to insufficient SunnyPanel launch plan", () => {
  const intent: Extract<AgentIntent, { intent: "compose_plan" }> = {
    args: {
      sourceText: "帮我计划 SunnyPanel 6月30日前上线",
    },
    confidence: 0.91,
    intent: "compose_plan",
  };
  const gate = evaluatePlanReadinessGate({
    intent,
    userMessage: "帮我计划 SunnyPanel 6月30日前上线",
  });

  assert.equal(gate.gateApplied, true);
  if (!gate.gateApplied) assert.fail("expected gate to apply");
  assert.equal(gate.readiness.status, "insufficient");
  assert.equal(gate.intent, "clarify");
  assert.equal(gate.pendingAction, null);
  assert.ok(gate.readiness.suggestedQuestions.length > 0);
  assert.ok(gate.readiness.suggestedQuestions.length <= 5);
  assert.match(gate.assistantMessage, /关键点|确认/);
  assert.match(gate.assistantMessage, /目标：SunnyPanel 第一版上线/);
  assert.match(gate.assistantMessage, /截止：6月30日/);
  assert.match(gate.assistantMessage, /第一版必须包含哪些功能|交付物/);
  assert.equal(gate.traceStep.id, "plan-readiness-gate");
  assert.match(gate.traceStep.detail ?? "", /"gateApplied":true/);
  assert.match(gate.traceStep.detail ?? "", /"status":"insufficient"/);
});

test("readiness gate ignores small explicit plan so old dry-run behavior can continue", () => {
  const intent: Extract<AgentIntent, { intent: "compose_plan" }> = {
    args: {
      sourceText: "帮我创建一个计划：今天晚上 8 点到 10 点完成登录页修复",
    },
    intent: "compose_plan",
  };
  const gate = evaluatePlanReadinessGate({
    intent,
    userMessage: "帮我创建一个计划：今天晚上 8 点到 10 点完成登录页修复",
  });

  assert.equal(gate.gateApplied, false);
});

test("readiness gate does not block plain create_plan title creation", () => {
  const intent: Extract<AgentIntent, { intent: "create_plan" }> = {
    args: {
      title: "恢复计划",
    },
    intent: "create_plan",
  };
  const gate = evaluatePlanReadinessGate({
    intent,
    userMessage: "创建恢复计划",
  });

  assert.equal(gate.gateApplied, false);
});

test("readiness gate only targets compose_plan and create_plan", () => {
  assert.equal(isPlanReadinessGateIntent({ args: { answer: "直接回答" }, intent: "answer_question" }), false);
  assert.equal(isPlanReadinessGateIntent({ args: { title: "测试计划" }, intent: "create_plan" }), true);
  assert.equal(isPlanReadinessGateIntent({ args: { sourceText: "计划" }, intent: "compose_plan" }), true);
  assert.equal(
    isPlanReadinessGateIntent({
      args: {
        checklistTitle: "上线清单",
        itemTitle: "补测试",
      },
      intent: "append_plan_item",
    }),
    false,
  );
});

test("extractPlanReadinessSlotsFromIntent reads plan args conservatively", () => {
  const slots = extractPlanReadinessSlotsFromIntent({
    args: {
      description: "登录、Agent 对话和部署",
      dueDate: "2026-06-30",
      title: "SunnyPanel 第一版上线",
    },
    intent: "create_plan",
  });

  assert.equal(slots.goal, "SunnyPanel 第一版上线");
  assert.equal(slots.deadline, "2026-06-30");
  assert.equal(slots.scope, "登录、Agent 对话和部署");
});

test("clarification message caps questions at five", () => {
  const gate = evaluatePlanReadinessGate({
    intent: {
      args: { sourceText: "帮我制定考研计划" },
      intent: "compose_plan",
    },
    userMessage: "帮我制定考研计划",
  });

  assert.equal(gate.gateApplied, true);
  if (!gate.gateApplied) assert.fail("expected gate to apply");
  const numberedQuestions = gate.assistantMessage
    .split("\n")
    .filter((line) => /^\d+\.\s/.test(line));
  assert.ok(numberedQuestions.length > 0);
  assert.ok(numberedQuestions.length <= 5);
});

test("full LangGraph adapter returns clarification before dry-run for insufficient plan", async () => {
  const trace: AgentTraceStep[] = [];
  let dryRunCalled = false;
  let executeCalled = false;
  const steps: FullLangGraphAdapterSteps = {
    appendAgentThreadTurn: async ({ pendingAction }) => ({
      ...makeThread(),
      pendingAction,
    }) as AgentThread,
    runAgentLearningLoop: async () => ({
      candidates: [],
      decisions: [],
      savedMemories: [],
      source: "fallback",
      suggestedMemories: [],
    }),
    runBuildContextStep: async () => ({
      context,
      contextSummary: "上下文",
      tokenUsage,
      workingMemory: {
        pendingConfirmations: [],
        recentActions: [],
        sessionId: "planning-gate",
      },
    }),
    runDryRunAndProposeStep: async () => {
      dryRunCalled = true;
      throw new Error("dry-run should not run for insufficient plan readiness");
    },
    runExecuteAndPersistStep: async () => {
      executeCalled = true;
      throw new Error("execute should not run for insufficient plan readiness");
    },
    runOrchestrationStep: async ({ tokenUsage: usage }) => ({
      data: {
        preResolvedIntent: null,
        tokenUsage: usage,
      },
      outcome: "continue",
    }),
    runResolveIntentStep: async ({ tokenUsage: usage }) => ({
      data: {
        confirmedActionId: null,
        resolution: {
          engine: "heuristic",
          intent: {
            args: {
              sourceText: "帮我计划 SunnyPanel 6月30日前上线",
            },
            confidence: 0.9,
            intent: "compose_plan",
          },
        },
        tokenUsage: usage,
      },
      outcome: "continue",
    }),
  };
  const run = createRunFullLangGraphAgentChatPipeline(
    {
      baseTokenUsage: tokenUsage,
      contextPreferences: null,
      finalizeTurn: async ({ response }) => ({
        ...response,
        threadId: 920,
      }),
      message: "帮我计划 SunnyPanel 6月30日前上线",
      payload: {} as never,
      pendingAction: null,
      resolvedHistory: [],
      structuredConfirmation: null,
      thread: makeThread(),
      user: { id: 1 },
      userPreferences: null,
      workbenchMode: null,
    },
    steps,
    { checkpointer: new MemorySaver() },
  );

  const response = await run(
    () => undefined,
    (step) => trace.push(step),
  );

  assert.equal(dryRunCalled, false);
  assert.equal(executeCalled, false);
  assert.equal(response.intent, "clarify");
  assert.equal(response.pendingAction, null);
  assert.match(response.assistantMessage, /生成完整计划前/);
  assert.match(response.assistantMessage, /目标：SunnyPanel 第一版上线/);
  assert.ok(trace.some((step) => step.id === "plan-readiness-gate"));
  assert.equal(trace.some((step) => /policy/i.test(step.id) || /Policy Guard/i.test(step.title)), false);
});

test("full LangGraph adapter keeps old dry-run path for small explicit plans", async () => {
  let dryRunCalled = false;
  const pendingAction: PendingAction = {
    action: makeConfirmationAction("compose_plan"),
    type: "await_confirmation",
  };
  const steps: FullLangGraphAdapterSteps = {
    appendAgentThreadTurn: async ({ pendingAction: nextPendingAction }) => ({
      ...makeThread(),
      pendingAction: nextPendingAction,
    }) as AgentThread,
    runAgentLearningLoop: async () => ({
      candidates: [],
      decisions: [],
      savedMemories: [],
      source: "fallback",
      suggestedMemories: [],
    }),
    runBuildContextStep: async () => ({
      context,
      contextSummary: "上下文",
      tokenUsage,
      workingMemory: {
        pendingConfirmations: [],
        recentActions: [],
        sessionId: "planning-gate-small",
      },
    }),
    runDryRunAndProposeStep: async ({ tokenUsage: usage }) => {
      dryRunCalled = true;

      return {
        outcome: "early_exit",
        response: {
          assistantMessage: "已生成待确认变更",
          confidence: 0.9,
          engine: "heuristic",
          intent: "compose_plan",
          pendingAction,
          threadId: 920,
          tokenUsage: usage,
        },
      };
    },
    runExecuteAndPersistStep: async () => {
      throw new Error("execute is not part of this test");
    },
    runOrchestrationStep: async ({ tokenUsage: usage }) => ({
      data: {
        preResolvedIntent: null,
        tokenUsage: usage,
      },
      outcome: "continue",
    }),
    runResolveIntentStep: async ({ tokenUsage: usage }) => ({
      data: {
        confirmedActionId: null,
        resolution: {
          engine: "heuristic",
          intent: {
            args: {
              sourceText: "帮我创建一个计划：今天晚上 8 点到 10 点完成登录页修复",
            },
            confidence: 0.9,
            intent: "compose_plan",
          },
        },
        tokenUsage: usage,
      },
      outcome: "continue",
    }),
  };
  const run = createRunFullLangGraphAgentChatPipeline(
    {
      baseTokenUsage: tokenUsage,
      contextPreferences: null,
      finalizeTurn: async ({ response }) => ({
        ...response,
        threadId: 920,
      }),
      message: "帮我创建一个计划：今天晚上 8 点到 10 点完成登录页修复",
      payload: {} as never,
      pendingAction: null,
      resolvedHistory: [],
      structuredConfirmation: null,
      thread: makeThread(),
      user: { id: 1 },
      userPreferences: null,
      workbenchMode: null,
    },
    steps,
    { checkpointer: new MemorySaver() },
  );

  const response = await run();

  assert.equal(dryRunCalled, true);
  assert.equal(response.pendingAction?.type, "await_confirmation");
});
