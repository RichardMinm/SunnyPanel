import assert from "node:assert/strict";
import { test } from "node:test";

import type { OrchestratorTask } from "../../../src/lib/agent/llm/schemas/orchestrator-output";
import type { AgentPromptContext } from "../../../src/lib/agent/prompts";
import {
  loadR4AGreenModule,
  R4A_GREEN_MODULES,
} from "./fixtures/r4a-red-module-loader";

type ProductionObservation = Readonly<{
  answerLogicalCalls: number;
  answerProviderAttempts: number;
  boundaryResolutionKind: "clarify" | "compound" | "not_applicable" | "pure_query";
  candidateValidationResult: "not_called" | "rejected" | "valid";
  finalDependencies: readonly Readonly<{
    dependsOn: readonly string[];
    taskId: string;
  }>[];
  finalTaskIntents: readonly string[];
  fixedQueryIntent: string | null;
  fixedTaskOwnership: "deterministic_query_boundary" | null;
  fullOrchestratorLogicalCalls: number;
  fullOrchestratorProviderAttempts: number;
  mapperReached: boolean;
  queryCommentaryLogicalCalls: number;
  queryCommentaryProviderAttempts: number;
  queryDispatcherDecision: "adopted" | "legacy" | "not_called";
  residualPlannerLogicalCalls: number;
  residualPlannerProviderAttempts: number;
  specialistLogicalCalls: number;
  specialistProviderAttempts: number;
  unexpectedDuplicateModelCalls: number;
  usableStatus: "unavailable" | "usable";
}>;

type ProductionEvaluationModule = Readonly<{
  evaluateHybridProductionCase: (input: Readonly<{
    authenticatedActor: Readonly<{
      collection: "users";
      id: number;
      isAdmin: boolean;
    }>;
    context: AgentPromptContext;
    fixtureId: string;
    message: string;
    queryAdoption: "admin" | "off";
    queryRuntime: "langchain" | "legacy";
    residualInvoke: (
      attempt: number,
    ) => Promise<readonly OrchestratorTask[]>;
  }>) => Promise<ProductionObservation>;
}>;

const context: AgentPromptContext = {
  checklists: [],
  now: "2026-07-17T12:00:00.000+08:00",
  pendingAction: null,
  plans: [{
    id: 101,
    priority: "medium",
    state: "active",
    title: "考研数学复习计划",
  }],
};

const loadHarness = () => loadR4AGreenModule<ProductionEvaluationModule>(
  R4A_GREEN_MODULES.productionEvaluation,
  "hybrid_production_evaluation",
);

test("production harness runs pure Query through the real dispatcher adoption gate", async () => {
  const { evaluateHybridProductionCase } = await loadHarness();

  const adopted = await evaluateHybridProductionCase({
    authenticatedActor: { collection: "users", id: 1, isAdmin: true },
    context,
    fixtureId: "qry-1",
    message: "看看我的工作计划进度",
    queryAdoption: "admin",
    queryRuntime: "langchain",
    residualInvoke: async () => assert.fail("pure Query must not call Residual"),
  });
  assert.equal(adopted.boundaryResolutionKind, "pure_query");
  assert.equal(adopted.queryDispatcherDecision, "adopted");
  assert.equal(adopted.fullOrchestratorLogicalCalls, 0);
  assert.equal(adopted.residualPlannerLogicalCalls, 0);

  const adoptionOff = await evaluateHybridProductionCase({
    authenticatedActor: { collection: "users", id: 1, isAdmin: true },
    context,
    fixtureId: "qry-1-off",
    message: "看看我的工作计划进度",
    queryAdoption: "off",
    queryRuntime: "langchain",
    residualInvoke: async () => assert.fail("pure Query must not call Residual"),
  });
  assert.equal(adoptionOff.queryDispatcherDecision, "legacy");

  const untrusted = await evaluateHybridProductionCase({
    authenticatedActor: { collection: "users", id: 1, isAdmin: false },
    context,
    fixtureId: "qry-1-untrusted",
    message: "看看我的工作计划进度",
    queryAdoption: "admin",
    queryRuntime: "langchain",
    residualInvoke: async () => assert.fail("pure Query must not call Residual"),
  });
  assert.equal(untrusted.queryDispatcherDecision, "legacy");
});

test("production harness routes Compound through real Composer, validator, and Mapper", async () => {
  const { evaluateHybridProductionCase } = await loadHarness();
  let residualAdapterCalls = 0;

  const observation = await evaluateHybridProductionCase({
    authenticatedActor: { collection: "users", id: 1, isAdmin: true },
    context,
    fixtureId: "cmp-4",
    message: "检查项目进度，记录未完成的作为新任务",
    queryAdoption: "admin",
    queryRuntime: "langchain",
    residualInvoke: async () => {
      residualAdapterCalls += 1;
      return [{
        agentRole: "plan",
        args: { title: "未完成任务" },
        dependsOn: [],
        id: "draft",
        intent: "compose_checklist",
        label: "整理未完成任务",
      }];
    },
  });

  assert.equal(residualAdapterCalls, 1);
  assert.equal(observation.boundaryResolutionKind, "compound");
  assert.equal(observation.candidateValidationResult, "valid");
  assert.equal(observation.mapperReached, true);
  assert.deepEqual(observation.finalTaskIntents, [
    "query_progress",
    "compose_checklist",
  ]);
  assert.equal(observation.fullOrchestratorLogicalCalls, 0);
  assert.equal(observation.residualPlannerLogicalCalls, 1);
  assert.equal(observation.residualPlannerProviderAttempts, 1);
  assert.equal(observation.unexpectedDuplicateModelCalls, 0);
});

test("production observation has complete role counters and retains no raw fixture data", async () => {
  const { evaluateHybridProductionCase } = await loadHarness();
  const sentinel = "R4A_TASK5_SECRET_TITLE";
  const observation = await evaluateHybridProductionCase({
    authenticatedActor: { collection: "users", id: 1, isAdmin: true },
    context: {
      ...context,
      plans: [{ ...context.plans[0], title: sentinel }],
    },
    fixtureId: "qry-secret",
    message: "看看我的工作计划进度",
    queryAdoption: "admin",
    queryRuntime: "langchain",
    residualInvoke: async () => assert.fail("pure Query must not call Residual"),
  });

  for (const field of [
    "fullOrchestratorLogicalCalls",
    "fullOrchestratorProviderAttempts",
    "residualPlannerLogicalCalls",
    "residualPlannerProviderAttempts",
    "queryCommentaryLogicalCalls",
    "queryCommentaryProviderAttempts",
    "answerLogicalCalls",
    "answerProviderAttempts",
    "specialistLogicalCalls",
    "specialistProviderAttempts",
    "unexpectedDuplicateModelCalls",
  ] as const) {
    assert.equal(typeof observation[field], "number", field);
  }
  assert.doesNotMatch(JSON.stringify(observation), new RegExp(sentinel));
});
