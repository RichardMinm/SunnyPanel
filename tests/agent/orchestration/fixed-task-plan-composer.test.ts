import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  orchestratorOutputSchema,
  validateTaskDAG,
} from "../../../src/lib/agent/llm/schemas/orchestrator-output";
import { mapStructuredOutputToPlan } from "../../../src/lib/agent/orchestration/orchestrator-mapper";
import type { FixedTaskPlanComposerModule } from "./fixtures/hybrid-query-boundary-contract";
import {
  aggregateMetadata,
  aggregateQueryTask,
  residualWriteTask,
} from "./fixtures/hybrid-query-boundary-contract";
import {
  loadR4AGreenModule,
  R4A_GREEN_MODULES,
} from "./fixtures/r4a-red-module-loader";

const loadComposer = (contract: string) => loadR4AGreenModule<FixedTaskPlanComposerModule>(
  R4A_GREEN_MODULES.composer,
  contract,
);

test("Composer returns a schema-valid synthetic OrchestratorOutput that Mapper accepts", async () => {
  const { composeFixedTaskPlan } = await loadComposer("composer_schema_output");
  const result = composeFixedTaskPlan({
    fixedMetadata: aggregateMetadata(),
    fixedQueryTask: aggregateQueryTask(),
    residualTasks: [residualWriteTask()],
  });
  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  assert.equal("tasks" in result.candidate, false);
  assert.equal(result.candidate.output.mode, "compound");
  assert.equal(result.candidate.output.decisionCode, "compound_ready");
  assert.equal(orchestratorOutputSchema.safeParse(result.candidate.output).success, true);
  assert.deepEqual(validateTaskDAG(result.candidate.output), { errors: [], valid: true });
  const mapped = mapStructuredOutputToPlan(result.candidate.output);
  assert.deepEqual(mapped.tasks.map(({ intent }) => intent), [
    "query_progress",
    "compose_checklist",
  ]);
});

test("Composer deterministically renumbers tasks and rewrites root/internal dependencies", async () => {
  const { composeFixedTaskPlan } = await loadComposer("composer_id_dependency_remap");
  const result = composeFixedTaskPlan({
    fixedMetadata: aggregateMetadata("query-old"),
    fixedQueryTask: aggregateQueryTask("query-old"),
    residualTasks: [
      residualWriteTask("draft-a"),
      residualWriteTask("draft-b", ["draft-a"]),
    ],
  });
  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  assert.deepEqual(result.candidate.output.tasks.map(({ id }) => id), ["t1", "t2", "t3"]);
  assert.deepEqual(result.candidate.output.tasks.map(({ dependsOn }) => dependsOn), [
    [],
    ["t1"],
    ["t2"],
  ]);
  assert.deepEqual(result.candidate.fixedTaskMetadata, [{
    ...aggregateMetadata("t1"),
    taskId: "t1",
  }]);
});

test("Composer rejects every unknown residual dependency", async () => {
  const { composeFixedTaskPlan } = await loadComposer("composer_unknown_dependency");
  const result = composeFixedTaskPlan({
    fixedMetadata: aggregateMetadata(),
    fixedQueryTask: aggregateQueryTask(),
    residualTasks: [residualWriteTask("draft-a", ["missing-task"])],
  });
  assert.deepEqual(result, { code: "unknown_dependency", status: "unavailable" });
});

test("Composer rejects Query-family residual tasks instead of deleting them", async () => {
  const { composeFixedTaskPlan } = await loadComposer("composer_forbidden_query_intent");
  const result = composeFixedTaskPlan({
    fixedMetadata: aggregateMetadata(),
    fixedQueryTask: aggregateQueryTask(),
    residualTasks: [{
      agentRole: "query",
      args: {},
      dependsOn: [],
      id: "query-again",
      intent: "query_plan_progress",
      label: "再次读取计划",
    }],
  });
  assert.deepEqual(result, { code: "forbidden_intent", status: "unavailable" });
});

test("Composer never places provenance metadata in task args", async () => {
  const { composeFixedTaskPlan } = await loadComposer("composer_sidecar_isolation");
  const result = composeFixedTaskPlan({
    fixedMetadata: aggregateMetadata(),
    fixedQueryTask: aggregateQueryTask(),
    residualTasks: [residualWriteTask()],
  });
  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  for (const task of result.candidate.output.tasks) {
    assert.equal("ownership" in task.args, false);
    assert.equal("queryScopeProvenance" in task.args, false);
  }
  assert.equal(result.candidate.fixedTaskMetadata[0].ownership, "deterministic_query_boundary");
});

test("Composer is pure and imports neither Mapper nor execution modules", async () => {
  await loadComposer("composer_no_mapper_or_execution");
  const source = readFileSync(R4A_GREEN_MODULES.composer, "utf8");
  assert.doesNotMatch(source, /orchestrator-mapper|mapStructuredOutputToPlan/);
  assert.doesNotMatch(source, /Executor|Receipt|Rollback|executeAgentIntent|payload\.(?:create|delete|update)/);
});
