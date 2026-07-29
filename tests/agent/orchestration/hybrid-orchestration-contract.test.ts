import assert from "node:assert/strict";
import test from "node:test";

import type {
  OrchestratorOutput,
} from "../../../src/lib/agent/llm/schemas/orchestrator-output";
import { createModelCallBudgetRecorder } from "../../../src/lib/agent/orchestration/model-call-budget";
import type { HybridFailureCode } from "../../../src/lib/agent/orchestration/hybrid-query-boundary";
import type {
  HybridOrchestrationModule,
  ResidualPlannerResult,
} from "./fixtures/hybrid-query-boundary-contract";
import {
  focusedFixture,
  residualWriteTask,
} from "./fixtures/hybrid-query-boundary-contract";
import {
  loadR4AGreenModule,
  R4A_GREEN_MODULES,
} from "./fixtures/r4a-red-module-loader";

const loadHybrid = (contract: string) => loadR4AGreenModule<HybridOrchestrationModule>(
  R4A_GREEN_MODULES.hybrid,
  contract,
);

const singleOutput = (intent: "answer_question" | "query_progress"): OrchestratorOutput => ({
  decisionCode: intent === "answer_question" ? "pure_consultation" : "pure_read_query",
  mode: "single",
  routingSummary: "处理请求",
  tasks: [{
    agentRole: "query",
    args: {},
    dependsOn: [],
    id: "t1",
    intent,
    label: "处理请求",
  }],
  version: 2,
});

const runInput = (
  fixtureId: "cmp-4" | "inj-2" | "qry-1" | "qry-4",
  overrides: Partial<Parameters<HybridOrchestrationModule["runHybridOrchestration"]>[0]> = {},
): Parameters<HybridOrchestrationModule["runHybridOrchestration"]>[0] => {
  const fixture = focusedFixture(fixtureId);
  return {
    authenticatedActor: { collection: "users" as const, id: 7 },
    context: fixture.context,
    originalRequest: fixture.message,
    queryAdoption: "admin",
    queryRuntime: "langchain",
    runFullOrchestrator: async () => assert.fail("full Orchestrator must not run"),
    runQueryDispatcher: async () => "adopted" as const,
    runResidualPlanner: async () => assert.fail("Residual Planner must not run"),
    ...overrides,
  };
};

test("the compatibility facade retains the stable Residual timeout code", () => {
  const failureCode: HybridFailureCode = "residual_timeout";
  assert.equal(failureCode, "residual_timeout");
});

test("qry-1 takes the pure Query fast path without Orchestrator or Residual Planner", async () => {
  const { runHybridOrchestration } = await loadHybrid("hybrid_qry_1_fast_path");
  let queryCalls = 0;
  const result = await runHybridOrchestration(runInput("qry-1", {
    runQueryDispatcher: async (intent, actor) => {
      queryCalls += 1;
      assert.equal(intent.intent, "query_progress");
      assert.deepEqual(actor, { isAdmin: true });
      return "adopted";
    },
  }));
  assert.equal(result.boundaryResolution, "pure_query");
  assert.equal(result.queryDispatcherSelection, "adopted");
  assert.equal(result.callAccounting.fullOrchestratorLogicalCalls, 0);
  assert.equal(result.callAccounting.residualPlannerLogicalCalls, 0);
  assert.equal(queryCalls, 1);
});

test("qry-4 deterministically clarifies with a non-blank question and zero model calls", async () => {
  const { runHybridOrchestration } = await loadHybrid("hybrid_qry_4_clarify");
  const result = await runHybridOrchestration(runInput("qry-4", {
    runQueryDispatcher: async () => assert.fail("Query Dispatcher must not run for clarify"),
  }));
  assert.equal(result.boundaryResolution, "clarify");
  assert.equal(result.callAccounting.fullOrchestratorLogicalCalls, 0);
  assert.equal(result.callAccounting.residualPlannerLogicalCalls, 0);
  assert.equal(result.callAccounting.queryCommentaryLogicalCalls, 0);
  assert.equal(result.output?.tasks[0].intent, "clarify");
  assert.ok(String(result.output?.tasks[0].args.question).trim().length > 0);
});

test("inj-2 keeps workspace injection as data and remains aggregate pure Query", async () => {
  const { runHybridOrchestration } = await loadHybrid("hybrid_inj_2_untrusted_workspace");
  const result = await runHybridOrchestration(runInput("inj-2"));
  assert.equal(result.boundaryResolution, "pure_query");
  assert.equal(result.callAccounting.fullOrchestratorLogicalCalls, 0);
  assert.equal(result.candidate, undefined);
});

test("cmp-4 uses one Residual Planner call and a Boundary-owned fixed Query task", async () => {
  const { runHybridOrchestration } = await loadHybrid("hybrid_cmp_4_compound");
  let residualCalls = 0;
  const result = await runHybridOrchestration(runInput("cmp-4", {
    runQueryDispatcher: async () => assert.fail("compound fixed Query is executed by the compound graph, not dispatched early"),
    runResidualPlanner: async () => {
      residualCalls += 1;
      return {
        logicalCalls: 1,
        providerAttempts: 1,
        status: "success",
        tasks: [residualWriteTask()],
      } satisfies ResidualPlannerResult;
    },
  }));
  assert.equal(result.boundaryResolution, "compound");
  assert.equal(result.callAccounting.fullOrchestratorLogicalCalls, 0);
  assert.equal(result.callAccounting.residualPlannerLogicalCalls, 1);
  assert.equal(residualCalls, 1);
  assert.deepEqual(result.candidate?.output.tasks.map(({ intent }) => intent), [
    "query_progress",
    "compose_checklist",
  ]);
  assert.deepEqual(result.candidate?.output.tasks.map(({ dependsOn }) => dependsOn), [[], ["t1"]]);
  assert.equal(result.candidate?.fixedTaskMetadata[0].ownership, "deterministic_query_boundary");
});

test("not-applicable requests use at most one full Orchestrator logical call", async () => {
  const { runHybridOrchestration } = await loadHybrid("hybrid_not_applicable_full_orchestrator");
  const fixture = focusedFixture("qry-1");
  let fullCalls = 0;
  const result = await runHybridOrchestration({
    ...runInput("qry-1"),
    originalRequest: "线性代数应该怎么入门？",
    runFullOrchestrator: async () => {
      fullCalls += 1;
      return singleOutput("answer_question");
    },
  });
  assert.equal(result.boundaryResolution, "not_applicable");
  assert.equal(result.callAccounting.fullOrchestratorLogicalCalls, 1);
  assert.equal(result.callAccounting.residualPlannerLogicalCalls, 0);
  assert.equal(fullCalls, 1);
  assert.equal(fixture.context.plans.length, 1);
});

test("unsupported Query mutations use the Full Orchestrator without a Residual call", async () => {
  const { runHybridOrchestration } = await loadHybrid(
    "hybrid_unsupported_query_mutation_full_orchestrator",
  );
  let fullCalls = 0;
  let residualCalls = 0;
  const result = await runHybridOrchestration({
    ...runInput("cmp-4"),
    originalRequest: "检查项目进度并取消当前计划",
    runFullOrchestrator: async () => {
      fullCalls += 1;
      return singleOutput("answer_question");
    },
    runResidualPlanner: async () => {
      residualCalls += 1;
      return {
        code: "provider_error",
        logicalCalls: 1,
        providerAttempts: 0,
        status: "unavailable",
      };
    },
  });

  assert.equal(result.boundaryResolution, "not_applicable");
  assert.equal(result.callAccounting.fullOrchestratorLogicalCalls, 1);
  assert.equal(result.callAccounting.residualPlannerLogicalCalls, 0);
  assert.equal(fullCalls, 1);
  assert.equal(residualCalls, 0);
});

test("the Query Boundary cannot be disabled by an Orchestrator runtime choice", async () => {
  const { runHybridOrchestration } = await loadHybrid("hybrid_authoritative_boundary");
  let fullCalls = 0;
  const result = await runHybridOrchestration(runInput("qry-1", {
    runFullOrchestrator: async () => {
      fullCalls += 1;
      return singleOutput("query_progress");
    },
  }));
  assert.equal(result.boundaryResolution, "pure_query");
  assert.equal(result.callAccounting.fullOrchestratorLogicalCalls, 0);
  assert.equal(fullCalls, 0);
});

test("model-call accounting exposes residual logical and Provider-attempt counters", () => {
  const recorder = createModelCallBudgetRecorder() as unknown as {
    record: (role: "residual_planner", scopeId: string) => boolean;
    recordProviderAttempt: (role: "residual_planner") => void;
    snapshot: () => Record<string, number>;
  };
  assert.equal(recorder.record("residual_planner", "compound-1"), true);
  recorder.recordProviderAttempt("residual_planner");
  recorder.recordProviderAttempt("residual_planner");
  const snapshot = recorder.snapshot();
  assert.equal(snapshot.residualPlannerLogicalCalls, 1);
  assert.equal(snapshot.residualPlannerProviderAttempts, 2);
  assert.equal(snapshot.unexpectedDuplicateModelCalls, 0);
});

test("a duplicate residual logical scope increments the shared duplicate counter", () => {
  const recorder = createModelCallBudgetRecorder() as unknown as {
    record: (role: "residual_planner", scopeId: string) => boolean;
    snapshot: () => Record<string, number>;
  };
  assert.equal(recorder.record("residual_planner", "compound-1"), true);
  assert.equal(recorder.record("residual_planner", "compound-1"), false);
  const snapshot = recorder.snapshot();
  assert.equal(snapshot.residualPlannerLogicalCalls, 1);
  assert.equal(snapshot.unexpectedDuplicateModelCalls, 1);
});
