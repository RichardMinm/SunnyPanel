import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { queryAgentDefinition } from "../../src/lib/agent/agents/registry";
import { runSpecializedAgentForTask } from "../../src/lib/agent/agents/run-specialized-agent";
import { resolveLegacyHeuristicStep } from "../../src/lib/agent/chat-pipeline/legacy-heuristic-resolution-step";
import { createModelCallBudgetRecorder } from "../../src/lib/agent/orchestration/model-call-budget";
import {
  ACTIVE_LEGACY_QUERY_MODEL_CALLS,
  ACTIVE_QUERY_OWNERSHIP,
} from "../../src/lib/agent/query/ownership";
import { dispatchPreResolvedQuery } from "../../src/lib/agent/query/dispatcher";
import { resolveBoundaryOwnedQueryConfig } from "../../src/lib/agent/query/runtime-config";
import type { QueryFacts } from "../../src/lib/agent/query/types";
import type {
  AgentChatResponse,
  AgentIntent,
} from "../../src/lib/agent/schemas";
import type { TaskNode } from "../../src/lib/agent/orchestration/types";
import type { AgentPromptContext } from "../../src/lib/agent/prompts";
import type { AgentThread } from "../../src/payload-types";
import {
  getPayloadStubOperations,
  resetPayloadStub,
} from "../stubs/payload-client";

const tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]> = {
  contextTokens: 1,
  inputTokens: 1,
  outputTokens: 0,
  providerInputTokens: 0,
  providerOutputTokens: 0,
  source: "estimate",
  totalTokens: 2,
};

const promptContext: AgentPromptContext = {
  checklists: [],
  now: "2026-08-16T00:00:00.000+08:00",
  pendingAction: null,
  plans: [],
};

const queryIntent = (
  name: "query_plan_progress" | "query_progress",
): AgentIntent => name === "query_plan_progress"
  ? {
      args: { planId: 7 },
      confidence: 1,
      intent: name,
    }
  : {
      args: {},
      confidence: 1,
      intent: name,
    };

const factsFor = (intent: AgentIntent): QueryFacts =>
  intent.intent === "query_plan_progress"
    ? {
        dueDate: null,
        executionMode: "manual",
        kind: "plan_progress",
        phases: [],
        phasesProvided: true,
        planId: 7,
        priority: "medium",
        state: "active",
        storedProgressPercent: 50,
        title: "Synthetic plan",
        totalEstimatedDays: null,
        weeklyRhythm: null,
      }
    : {
        args: {},
        kind: "aggregate_progress",
        snapshot: {
          checklists: [],
          generatedAt: "2026-08-16T00:00:00.000+08:00",
          summary: {
            activePlans: 0,
            backlogPlans: 0,
            checklistCount: 0,
            completedChecklistItems: 0,
            completedPlans: 0,
            dueSoonPlans: 0,
            highPriorityPlans: 0,
            overallChecklistCompletionRate: 0,
            overduePlans: 0,
            pausedPlans: 0,
            planCount: 0,
            totalChecklistItems: 0,
          },
        },
      };

const withQueryEnvironment = async (
  runtime: string,
  adoption: string,
  run: () => Promise<void>,
) => {
  const previousRuntime = process.env.AGENT_QUERY_RUNTIME;
  const previousAdoption = process.env.AGENT_QUERY_ADOPTION;
  process.env.AGENT_QUERY_RUNTIME = runtime;
  process.env.AGENT_QUERY_ADOPTION = adoption;

  try {
    await run();
  } finally {
    if (previousRuntime === undefined) delete process.env.AGENT_QUERY_RUNTIME;
    else process.env.AGENT_QUERY_RUNTIME = previousRuntime;
    if (previousAdoption === undefined) delete process.env.AGENT_QUERY_ADOPTION;
    else process.env.AGENT_QUERY_ADOPTION = previousAdoption;
  }
};

const runProductionResolution = async (
  source: "heuristic" | "llm",
  intent: AgentIntent,
  recorder = createModelCallBudgetRecorder(),
) => resolveLegacyHeuristicStep({
  confirmationSignals: { cancel: false, confirm: false },
  context: promptContext,
  emitStatus: () => undefined,
  emitToken: () => undefined,
  emitUsage: () => undefined,
  intentModelEngine: "workflow",
  message: "查看进度",
  modelCallRecorder: recorder,
  modelResolver: async () => null,
  orchestratorPlanSource: source,
  pendingAction: null,
  persistAgentTurn: async () => ({ id: 1 }) as AgentThread,
  preResolvedIntent: intent,
  pushTrace: () => undefined,
  resolvedHistory: [],
  tokenUsage,
  trace: [],
  user: { collection: "users", id: 1 },
});

beforeEach(() => resetPayloadStub());

test("only Boundary-owned aggregate and plan queries can reach LangChain commentary", async () => {
  await withQueryEnvironment("langchain", "admin", async () => {
    for (const name of ["query_progress", "query_plan_progress"] as const) {
      const intent = queryIntent(name);
      const config = resolveBoundaryOwnedQueryConfig("heuristic");
      const calls = { facts: 0, legacy: 0, provider: 0 };
      const result = await dispatchPreResolvedQuery({
        actor: { isAdmin: true },
        adoption: config.adoption,
        intent,
        loadFacts: async () => {
          calls.facts += 1;
          return factsFor(intent);
        },
        runCommentary: async () => {
          calls.provider += 1;
          return {
            latencyMs: 1,
            modelCalls: 1,
            status: "accepted",
            text: "当前进展保持稳定。",
            ttftMs: 1,
          };
        },
        runLegacy: async () => {
          calls.legacy += 1;
          return { assistantMessage: "Legacy", pendingAction: null };
        },
        runtime: config.runtime,
      });

      assert.equal(result.outcome, "complete");
      assert.deepEqual(calls, { facts: 1, legacy: 0, provider: 1 });
    }
  });
});

test("LLM-owned queries are forced off at the production chat seam before facts or Provider", async () => {
  await withQueryEnvironment("langchain", "admin", async () => {
    for (const name of ["query_progress", "query_plan_progress"] as const) {
      resetPayloadStub();
      const recorder = createModelCallBudgetRecorder();
      const result = await runProductionResolution("llm", queryIntent(name), recorder);

      assert.equal(result.outcome, "continue");
      assert.deepEqual(getPayloadStubOperations(), []);
      assert.equal(recorder.snapshot().queryCommentaryLogicalCalls, 0);
      assert.equal(recorder.snapshot().queryCommentaryProviderAttempts, 0);
      assert.deepEqual(resolveBoundaryOwnedQueryConfig("llm"), {
        adoption: "off",
        runtime: "legacy",
      });
    }
  });
});

test("explicit legacy and off switches stop Boundary-owned facts and Provider work", async () => {
  await withQueryEnvironment("legacy", "off", async () => {
    for (const name of ["query_progress", "query_plan_progress"] as const) {
      resetPayloadStub();
      const recorder = createModelCallBudgetRecorder();
      const result = await runProductionResolution(
        "heuristic",
        queryIntent(name),
        recorder,
      );

      assert.equal(result.outcome, "continue");
      assert.deepEqual(getPayloadStubOperations(), []);
      assert.equal(recorder.snapshot().queryCommentaryLogicalCalls, 0);
      assert.equal(recorder.snapshot().queryCommentaryProviderAttempts, 0);
      assert.deepEqual(resolveBoundaryOwnedQueryConfig("heuristic"), {
        adoption: "off",
        runtime: "legacy",
      });
    }
  });
});

test("the production Query specialist owns zero active Legacy model calls", async () => {
  assert.equal(ACTIVE_LEGACY_QUERY_MODEL_CALLS, 0);
  assert.equal(ACTIVE_QUERY_OWNERSHIP.query_progress, "LANGCHAIN_ENHANCED");
  assert.equal(
    ACTIVE_QUERY_OWNERSHIP.query_plan_progress,
    "LANGCHAIN_ENHANCED",
  );
  assert.equal(queryAgentDefinition.enrichIntent, undefined);

  for (const name of ["query_progress", "query_plan_progress"] as const) {
    const intent = queryIntent(name);
    const recorder = createModelCallBudgetRecorder();
    const task: TaskNode = {
      agentRole: "query",
      args: intent.args,
      dependsOn: [],
      id: `production-${name}`,
      intent: name,
      label: "读取进度",
    };
    const result = await runSpecializedAgentForTask(task, {
      dryRunContext: {} as never,
      intent,
      message: "查看进度",
      modelCallRecorder: recorder,
      promptContext,
    });

    assert.equal(result.disposition, "bypassed_complete");
    assert.equal(recorder.snapshot().specialistLogicalCalls, 0);
    assert.equal(recorder.snapshot().specialistProviderAttempts, 0);
  }
});
