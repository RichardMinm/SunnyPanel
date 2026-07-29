import assert from "node:assert/strict";
import { test } from "node:test";

import type { Payload } from "payload";

import {
  runOrchestrationStep,
  type OrchestrationStepParams,
} from "../../../src/lib/agent/chat-pipeline/orchestration-step";
import type { AgentChatResponse } from "../../../src/lib/agent/schemas";
import { createSafeProtocolDiagnostics } from "../../../src/lib/agent/llm/structured-protocol";
import type { OrchestratorPlan } from "../../../src/lib/agent/orchestration/types";
import type { AgentThread } from "../../../src/payload-types";
import {
  focusedFixture,
  residualWriteTask,
} from "./fixtures/hybrid-query-boundary-contract";

const tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]> = {
  contextTokens: 1,
  inputTokens: 1,
  outputTokens: 0,
  providerInputTokens: 0,
  providerOutputTokens: 0,
  source: "estimate",
  totalTokens: 2,
};

const singlePlan = (
  intent: OrchestratorPlan["tasks"][number]["intent"],
): OrchestratorPlan => ({
  mode: "single",
  reasoning: "Injected Full adapter test plan.",
  tasks: [{
    agentRole: intent === "query_plan_progress" ? "query" : "plan",
    args: {},
    dependsOn: [],
    id: "injected-full-task",
    intent,
    label: "Injected Full adapter task",
  }],
});

const runStepForFixture = async (
  fixtureId: "qry-4" | "wrt-1",
  overrides: Partial<OrchestrationStepParams> = {},
) => {
  const fixture = fixtureId === "qry-4"
    ? focusedFixture("qry-4")
    : {
        context: {
          checklists: [],
          now: "2026-07-17T12:00:00.000+08:00",
          pendingAction: null,
          plans: [],
        },
        message: "帮我制定考研数学复习计划",
      };

  return runOrchestrationStep({
    context: fixture.context,
    emitStatus: () => undefined,
    emitToken: () => undefined,
    message: fixture.message,
    payload: {} as Payload,
    pendingAction: null,
    persistAgentTurn: async () => ({ id: 1 }) as AgentThread,
    pushTrace: () => undefined,
    tokenUsage,
    trace: [],
    user: { collection: "users", id: 1 },
    ...overrides,
  });
};

test("keeps the Hybrid Boundary active when the Full adapter is injected", async () => {
  let fullCalls = 0;
  const result = await runStepForFixture("qry-4", {
    runOrchestratorFn: async () => {
      fullCalls += 1;
      return singlePlan("query_plan_progress");
    },
  });

  assert.equal(result.outcome, "continue");
  if (result.outcome === "continue") {
    assert.equal(result.data.preResolvedIntent?.intent, "clarify");
  }
  assert.equal(fullCalls, 0);
});

test("calls an injected Full adapter only after not_applicable", async () => {
  let fullCalls = 0;
  const result = await runStepForFixture("wrt-1", {
    runOrchestratorFn: async () => {
      fullCalls += 1;
      return singlePlan("compose_plan");
    },
  });

  assert.equal(result.outcome, "continue");
  assert.equal(fullCalls, 1);
});

test("allows lower-seam tests to disable the Hybrid Boundary", async () => {
  let fullCalls = 0;
  const result = await runStepForFixture("qry-4", {
    hybridBoundaryMode: "disabled",
    runOrchestratorFn: async () => {
      fullCalls += 1;
      return singlePlan("query_plan_progress");
    },
  });

  assert.equal(result.outcome, "continue");
  assert.equal(fullCalls, 1);
});

test("production compound path validates the candidate before Mapper", async () => {
  let validatorCalls = 0;
  let mapperCalls = 0;
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
    mapStructuredOutputToPlanFn: () => {
      mapperCalls += 1;
      throw new Error("Mapper must not run after candidate rejection");
    },
    message: "检查项目进度，记录未完成的作为新任务",
    payload: {} as Payload,
    pendingAction: null,
    persistAgentTurn: async () => ({ id: 1 }) as AgentThread,
    pushTrace: () => undefined,
    runResidualPlannerFn: async () => ({
      logicalCalls: 1,
      providerAttempts: 1,
      status: "success" as const,
      tasks: [residualWriteTask()],
    }),
    tokenUsage,
    trace: [],
    user: { collection: "users", id: 1 },
    validateHybridCandidateFn: () => {
      validatorCalls += 1;
      return {
        code: "invalid_fixed_task_provenance" as const,
        status: "rejected" as const,
      };
    },
  };

  const result = await runOrchestrationStep(params);

  assert.equal(validatorCalls, 1);
  assert.equal(mapperCalls, 0);
  assert.equal(result.outcome, "continue");
  if (result.outcome === "continue") {
    assert.equal(result.data.preResolvedIntent?.intent, "clarify");
  }
});

test("passes the Residual structured observer through unchanged", async () => {
  const semanticEvents: boolean[] = [];
  const observer: NonNullable<
    OrchestrationStepParams["residualPlannerProviderAttemptObserver"]
  > = (event) => {
    if (event.phase === "semanticValidationCompleted") {
      semanticEvents.push(event.passed);
    }
  };
  let observerIdentityMatched = false;

  await runOrchestrationStep({
    context: focusedFixture("cmp-4").context,
    deferCompoundExecution: true,
    emitStatus: () => undefined,
    emitToken: () => undefined,
    message: focusedFixture("cmp-4").message,
    payload: {} as Payload,
    pendingAction: null,
    persistAgentTurn: async () => ({ id: 1 }) as AgentThread,
    pushTrace: () => undefined,
    residualPlannerProviderAttemptObserver: observer,
    runResidualPlannerFn: async (options) => {
      observerIdentityMatched = options.providerAttemptObserver === observer;
      options.providerAttemptObserver?.({
        attempt: 1,
        passed: true,
        phase: "semanticValidationCompleted",
        safeProtocol: createSafeProtocolDiagnostics(),
      });
      return {
        logicalCalls: 1,
        providerAttempts: 1,
        status: "success",
        tasks: [residualWriteTask()],
      };
    },
    tokenUsage,
    trace: [],
    user: { collection: "users", id: 1 },
  });

  assert.equal(observerIdentityMatched, true);
  assert.deepEqual(semanticEvents, [true]);
});
