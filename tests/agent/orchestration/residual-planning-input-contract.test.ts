import assert from "node:assert/strict";
import test from "node:test";

import type { ResidualPlannerModule } from "./fixtures/hybrid-query-boundary-contract";
import {
  residualInput,
  residualWriteTask,
} from "./fixtures/hybrid-query-boundary-contract";
import {
  loadR4AGreenModule,
  R4A_GREEN_MODULES,
} from "./fixtures/r4a-red-module-loader";
import { createModelCallBudgetRecorder } from "../../../src/lib/agent/orchestration/model-call-budget";

const loadResidualPlanner = (contract: string) => loadR4AGreenModule<ResidualPlannerModule>(
  R4A_GREEN_MODULES.residual,
  contract,
);

test("ResidualPlanningInput preserves the complete original request and has no remainingRequest", async () => {
  const { buildResidualPlanningInput } = await loadResidualPlanner("residual_full_original_request");
  const originalRequest = "检查项目进度，记录未完成的作为新任务";
  const input = buildResidualPlanningInput(residualInput(originalRequest));
  assert.equal(input.originalRequest, originalRequest);
  assert.equal("remainingRequest" in input, false);
  assert.deepEqual(input.fixedTasks, [{
    family: "query",
    intent: "query_progress",
    taskId: "query-original",
  }]);
});

test("a satisfied fixed Query family is also forbidden to the Residual Planner", async () => {
  const { buildResidualPlanningInput } = await loadResidualPlanner("residual_query_family_forbidden");
  const input = buildResidualPlanningInput(residualInput());
  assert.ok(input.satisfiedIntentFamilies.includes("query"));
  assert.ok(input.forbiddenIntentFamilies.includes("query"));
  assert.equal(input.allowedIntentFamilies.includes("query"), false);
});

test("the fake planner receives the full request and can retain the write intent", async () => {
  const { runResidualPlanner } = await loadResidualPlanner("residual_write_semantics_preserved");
  const input = residualInput();
  let calls = 0;
  const result = await runResidualPlanner({
    input,
    invoke: async (received) => {
      calls += 1;
      assert.equal(received.originalRequest, input.originalRequest);
      assert.ok(received.fixedTasks.some(({ intent }) => intent === "query_progress"));
      return [residualWriteTask()];
    },
  });
  assert.equal(result.status, "success");
  assert.equal(calls, 1);
  if (result.status !== "success") return;
  assert.deepEqual(result.tasks.map(({ intent }) => intent), ["compose_checklist"]);
  assert.equal(result.logicalCalls, 1);
});

test("a residual Query intent makes the entire plan unavailable without a second call", async () => {
  const { runResidualPlanner } = await loadResidualPlanner("residual_forbidden_intent_terminal");
  let calls = 0;
  const result = await runResidualPlanner({
    input: residualInput(),
    invoke: async () => {
      calls += 1;
      return [{
        agentRole: "query",
        args: {},
        dependsOn: [],
        id: "provider-query",
        intent: "query_progress",
        label: "重复读取进度",
      }];
    },
  });
  assert.deepEqual(result, {
    code: "forbidden_intent",
    logicalCalls: 1,
    providerAttempts: 1,
    status: "unavailable",
  });
  assert.equal(calls, 1);
});

test("transport retry increments attempts but not residual logical calls", async () => {
  const { runResidualPlanner } = await loadResidualPlanner("residual_transport_retry_accounting");
  const recorder = createModelCallBudgetRecorder();
  let calls = 0;
  const result = await runResidualPlanner({
    input: residualInput(),
    invoke: async () => {
      calls += 1;
      if (calls === 1) throw new Error("synthetic transport failure");
      return [residualWriteTask()];
    },
    maxTransportRetries: 1,
    modelCallRecorder: recorder,
  });
  assert.equal(result.status, "success");
  assert.equal(result.logicalCalls, 1);
  assert.equal(result.providerAttempts, 2);
  assert.equal(calls, 2);
  assert.equal(recorder.snapshot().residualPlannerLogicalCalls, 1);
  assert.equal(recorder.snapshot().residualPlannerProviderAttempts, 2);
});
