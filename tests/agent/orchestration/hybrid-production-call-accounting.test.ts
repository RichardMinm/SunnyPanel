import assert from "node:assert/strict";
import { test } from "node:test";

import type { Payload } from "payload";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

import {
  runOrchestrationStep,
  type OrchestrationStepParams,
} from "../../../src/lib/agent/chat-pipeline/orchestration-step";
import type { ModelFactory } from "../../../src/lib/agent/llm/model-factory";
import {
  evaluateProductionGateCase,
} from "../../../src/lib/agent/orchestration/hybrid-production-evaluation";
import { L3B_EVALUATION_FIXTURES } from "../../../src/lib/agent/orchestration/l3b-evaluation-fixtures";
import {
  createProductionAnswerAdapter,
  createProductionFullAdapter,
} from "../../../src/lib/agent/orchestration/l3b-production-gate-model-adapters";
import { createModelCallBudgetRecorder } from "../../../src/lib/agent/orchestration/model-call-budget";
import type { AgentChatResponse } from "../../../src/lib/agent/schemas";
import type { AgentThread } from "../../../src/payload-types";
import { residualWriteTask } from "./fixtures/hybrid-query-boundary-contract";

const tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]> = {
  contextTokens: 1,
  inputTokens: 1,
  outputTokens: 0,
  providerInputTokens: 0,
  providerOutputTokens: 0,
  source: "estimate",
  totalTokens: 2,
};

const modelConfig = {
  apiKey: "test-only",
  baseURL: "https://example.invalid",
  maxRetries: 0,
  model: "fake",
  provider: "deepseek",
  structuredOutputMode: "provider_default",
  temperature: 0,
  timeoutMs: 100,
} as const;

const promptJsonModelFactory = (
  invoke: () => unknown | Promise<unknown>,
): ModelFactory => () => ({
  withConfig: () => ({
    invoke: async () => ({ content: JSON.stringify(await invoke()) }),
  }),
}) as unknown as BaseChatModel;

test("production compound turn shares its recorder with the Residual Planner", async () => {
  const previousRuntime = process.env.AGENT_ORCHESTRATOR_RUNTIME;
  process.env.AGENT_ORCHESTRATOR_RUNTIME = "langchain";
  const recorder = createModelCallBudgetRecorder();
  let plannerRecorder: unknown;

  try {
    const params: OrchestrationStepParams & Record<string, unknown> = {
      context: {
        checklists: [],
        now: "2026-07-17T12:00:00.000+08:00",
        pendingAction: null,
        plans: [{
          id: 101,
          priority: "medium",
          state: "active",
          title: "考研数学复习计划",
        }],
      },
      deferCompoundExecution: true,
      emitStatus: () => undefined,
      emitToken: () => undefined,
      message: "检查项目进度，记录未完成的作为新任务",
      modelCallRecorder: recorder,
      payload: {} as Payload,
      pendingAction: null,
      persistAgentTurn: async () => ({ id: 1 }) as AgentThread,
      pushTrace: () => undefined,
      runResidualPlannerFn: async (options: Record<string, unknown>) => {
        plannerRecorder = options.modelCallRecorder;
        (plannerRecorder as typeof recorder | undefined)?.record(
          "residual_planner",
          "hybrid-query-boundary",
        );
        (plannerRecorder as typeof recorder | undefined)?.recordProviderAttempt(
          "residual_planner",
        );
        return {
          logicalCalls: 1,
          providerAttempts: 1,
          status: "success" as const,
          tasks: [residualWriteTask()],
        };
      },
      tokenUsage,
      trace: [],
      user: { collection: "users", id: 1 },
    };

    const result = await runOrchestrationStep(params);
    assert.equal(result.outcome, "compound");
    assert.equal(plannerRecorder, recorder);
    assert.deepEqual(
      {
        fullLogical: recorder.snapshot().orchestratorLogicalCalls,
        fullAttempts: recorder.snapshot().orchestratorProviderAttempts,
        residualLogical: recorder.snapshot().residualPlannerLogicalCalls,
        residualAttempts: recorder.snapshot().residualPlannerProviderAttempts,
      },
      {
        fullLogical: 0,
        fullAttempts: 0,
        residualLogical: 1,
        residualAttempts: 1,
      },
    );
  } finally {
    if (previousRuntime === undefined) {
      delete process.env.AGENT_ORCHESTRATOR_RUNTIME;
    } else {
      process.env.AGENT_ORCHESTRATOR_RUNTIME = previousRuntime;
    }
  }
});

test("clarify production turn leaves every model role at zero", async () => {
  const previousRuntime = process.env.AGENT_ORCHESTRATOR_RUNTIME;
  process.env.AGENT_ORCHESTRATOR_RUNTIME = "langchain";
  const recorder = createModelCallBudgetRecorder();

  try {
    const params: OrchestrationStepParams & Record<string, unknown> = {
      context: {
        checklists: [],
        now: "2026-07-17T12:00:00.000+08:00",
        pendingAction: null,
        plans: [{
          id: 101,
          priority: "medium",
          state: "active",
          title: "考研数学复习计划",
        }],
      },
      emitStatus: () => undefined,
      emitToken: () => undefined,
      message: "检查不存在的计划 999 的完成情况",
      modelCallRecorder: recorder,
      payload: {} as Payload,
      pendingAction: null,
      persistAgentTurn: async () => ({ id: 1 }) as AgentThread,
      pushTrace: () => undefined,
      tokenUsage,
      trace: [],
      user: { collection: "users", id: 1 },
    };

    const result = await runOrchestrationStep(params);
    assert.equal(result.outcome, "continue");
    assert.deepEqual(recorder.snapshot(), {
      answerLogicalCalls: 0,
      answerProviderAttempts: 0,
      conversationalAnswerCalls: 0,
      orchestratorCalls: 0,
      orchestratorLogicalCalls: 0,
      orchestratorProviderAttempts: 0,
      queryCommentaryCalls: 0,
      queryCommentaryLogicalCalls: 0,
      queryCommentaryProviderAttempts: 0,
      residualPlannerCalls: 0,
      residualPlannerLogicalCalls: 0,
      residualPlannerProviderAttempts: 0,
      replanCalls: 0,
      replanLogicalCalls: 0,
      replanProviderAttempts: 0,
      specialistCalls: 0,
      specialistLogicalCalls: 0,
      specialistProviderAttempts: 0,
      unexpectedDuplicateCalls: 0,
      unexpectedDuplicateModelCalls: 0,
    });
  } finally {
    if (previousRuntime === undefined) {
      delete process.env.AGENT_ORCHESTRATOR_RUNTIME;
    } else {
      process.env.AGENT_ORCHESTRATOR_RUNTIME = previousRuntime;
    }
  }
});

test("production Full retries count attempts without duplicating the logical call or observation", async () => {
  const selected = L3B_EVALUATION_FIXTURES.find(
    (candidate) => candidate.id === "wrt-1",
  );
  assert.ok(selected);
  const recorder = createModelCallBudgetRecorder();
  let attempts = 0;
  const fullOrchestratorAdapter = createProductionFullAdapter({
    modelConfig,
    modelFactory: promptJsonModelFactory(() => {
      attempts += 1;
      return attempts === 1
        ? { version: 1 }
        : {
            decisionCode: "explicit_write_ready",
            mode: "single",
            routingSummary: "bounded retry result",
            tasks: [{
              agentRole: "plan",
              args: { goal: "synthetic", title: "synthetic" },
              dependsOn: [],
              id: "t1",
              intent: "compose_plan",
              label: "bounded retry task",
            }],
            version: 2,
          };
    }),
    observe: () => undefined,
    recorder,
    retryBudget: { schema: 1, transport: 0 },
  });
  const answerAdapter = createProductionAnswerAdapter({
    modelConfig,
    observe: () => undefined,
    recorder,
  });

  const observation = await evaluateProductionGateCase({
    answerAdapter,
    authenticatedActor: { collection: "users", id: 1, isAdmin: true },
    fixture: selected,
    fullOrchestratorAdapter,
    modelCallRecorder: recorder,
    residualInvoke: async () => assert.fail("Full path cannot call Residual"),
    round: 1,
  });

  assert.equal(attempts, 2);
  assert.equal(observation.callAccounting.fullOrchestratorLogicalCalls, 1);
  assert.equal(observation.callAccounting.fullOrchestratorProviderAttempts, 2);
  assert.equal(observation.observationIndex, 1);
  assert.equal(observation.callAccounting.unexpectedDuplicateModelCalls, 0);
});
