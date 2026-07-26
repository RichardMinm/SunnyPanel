import assert from "node:assert/strict";
import test from "node:test";

import { mapStructuredOutputToPlan } from "../../../src/lib/agent/orchestration/orchestrator-mapper";
import type {
  ContextUniqueProvenanceIsUnconstructible,
  FixedTaskPlanComposerModule,
  HybridQueryBoundaryModule,
  ProviderSelectedProvenanceIsUnconstructible,
} from "./fixtures/hybrid-query-boundary-contract";
import {
  actorAuthorizedSnapshot,
  aggregateMetadata,
  aggregateQueryTask,
  focusedFixture,
  residualWriteTask,
} from "./fixtures/hybrid-query-boundary-contract";
import {
  loadR4AGreenModule,
  R4A_GREEN_MODULES,
} from "./fixtures/r4a-red-module-loader";

const loadBoundary = (contract: string) => loadR4AGreenModule<HybridQueryBoundaryModule>(
  R4A_GREEN_MODULES.boundary,
  contract,
);

test("forbidden provenance sources are absent from the closed type union", () => {
  const contextUnique: ContextUniqueProvenanceIsUnconstructible = true;
  const providerSelected: ProviderSelectedProvenanceIsUnconstructible = true;
  assert.equal(contextUnique, true);
  assert.equal(providerSelected, true);
});

test("generic progress produces aggregate user_unspecified provenance", async () => {
  const { resolveHybridQueryBoundary } = await loadBoundary("provenance_aggregate");
  const fixture = focusedFixture("qry-1");
  const result = resolveHybridQueryBoundary({
    authorizedSnapshot: actorAuthorizedSnapshot(),
    originalRequest: fixture.message,
  });
  assert.equal(result.kind, "pure_query");
  if (result.kind !== "pure_query") return;
  assert.deepEqual(result.fixedMetadata.queryScopeProvenance, {
    scope: "aggregate",
    source: "user_unspecified",
  });
  assert.equal(result.preResolvedIntent.intent, "query_progress");
});

test("explicit positive plan ID produces explicit_plan_id provenance", async () => {
  const { resolveHybridQueryBoundary } = await loadBoundary("provenance_explicit_plan_id");
  const result = resolveHybridQueryBoundary({
    authorizedSnapshot: actorAuthorizedSnapshot(),
    originalRequest: "查看 planId=101 的进度",
  });
  assert.equal(result.kind, "pure_query");
  if (result.kind !== "pure_query") return;
  assert.deepEqual(result.fixedMetadata.queryScopeProvenance, {
    planId: 101,
    scope: "plan",
    source: "explicit_plan_id",
  });
  assert.deepEqual(result.fixedQueryTask.args, { planId: 101 });
});

test("an exact full title produces resolved_exact_title provenance", async () => {
  const { resolveHybridQueryBoundary } = await loadBoundary("provenance_exact_title");
  const result = resolveHybridQueryBoundary({
    authorizedSnapshot: actorAuthorizedSnapshot(),
    originalRequest: "查看考研数学复习计划的进度",
  });
  assert.equal(result.kind, "pure_query");
  if (result.kind !== "pure_query") return;
  assert.deepEqual(result.fixedMetadata.queryScopeProvenance, {
    planId: 101,
    scope: "plan",
    source: "resolved_exact_title",
  });
});

test("a generic possessive plus a residual title selector is not downgraded to aggregate scope", async () => {
  const { resolveHybridQueryBoundary } = await loadBoundary(
    "provenance_generic_possessive_with_residual_selector",
  );
  const result = resolveHybridQueryBoundary({
    authorizedSnapshot: actorAuthorizedSnapshot(),
    originalRequest: "查看我的计划里数学的进度",
  });

  assert.equal(result.kind, "clarify");
  if (result.kind !== "clarify") return;
  assert.equal(result.providerCalls, 0);
  assert.equal(result.reason, "title_not_found");
});

test("generic scaffolding never strips selector-like title nouns", async () => {
  const { resolveHybridQueryBoundary } = await loadBoundary(
    "provenance_generic_scaffold_preserves_selector_nouns",
  );

  for (const selector of ["当前项目", "工作项目", "任务清单"]) {
    const result = resolveHybridQueryBoundary({
      authorizedSnapshot: actorAuthorizedSnapshot(),
      originalRequest: `查看我的计划里${selector}的进度`,
    });
    assert.equal(result.kind, "clarify", selector);
    if (result.kind !== "clarify") continue;
    assert.equal(result.providerCalls, 0);
    assert.equal(result.reason, "title_not_found");
  }
});

test("qry-4 cannot fuzzy-match the only Context plan and deterministically clarifies", async () => {
  const { resolveHybridQueryBoundary } = await loadBoundary("provenance_no_fuzzy_or_unique_context");
  const fixture = focusedFixture("qry-4");
  const result = resolveHybridQueryBoundary({
    authorizedSnapshot: actorAuthorizedSnapshot(),
    originalRequest: fixture.message,
  });
  assert.equal(result.kind, "clarify");
  if (result.kind !== "clarify") return;
  assert.equal(result.providerCalls, 0);
  assert.equal(result.output.mode, "single");
  assert.equal(result.output.tasks.length, 1);
  assert.equal(result.output.tasks[0].intent, "clarify");
  assert.equal(typeof result.output.tasks[0].args.question, "string");
  assert.ok(String(result.output.tasks[0].args.question).trim().length > 0);
});

test("cmp-4 carries the closed checklist-draft residual policy", async () => {
  const { resolveHybridQueryBoundary } = await loadBoundary(
    "cmp4_closed_residual_intent_policy",
  );
  const fixture = focusedFixture("cmp-4");
  const result = resolveHybridQueryBoundary({
    authorizedSnapshot: actorAuthorizedSnapshot(),
    originalRequest: fixture.message,
  });

  assert.equal(result.kind, "compound");
  if (result.kind !== "compound") return;
  assert.deepEqual(result.residualInput.intentPolicy, {
    allowedIntents: ["compose_checklist"],
    kind: "query_result_to_checklist_draft",
  });
  assert.deepEqual(result.residualInput.allowedIntentFamilies, [
    "write_candidate",
  ]);
});

test("an independent consultation plus mutation is not claimed by the closed policy", async () => {
  const { resolveHybridQueryBoundary } = await loadBoundary(
    "compound_consultation_uses_full_orchestrator",
  );
  const result = resolveHybridQueryBoundary({
    authorizedSnapshot: actorAuthorizedSnapshot(),
    originalRequest:
      "检查项目进度，解释为什么落后，并把未完成项记录为新任务",
  });

  assert.deepEqual(result, { kind: "not_applicable" });
});

test("an unsupported Query mutation stays on the Full Orchestrator path", async () => {
  const { resolveHybridQueryBoundary } = await loadBoundary(
    "unsupported_query_mutation_uses_full_orchestrator",
  );
  const result = resolveHybridQueryBoundary({
    authorizedSnapshot: actorAuthorizedSnapshot(),
    originalRequest: "检查项目进度并取消当前计划",
  });

  assert.deepEqual(result, { kind: "not_applicable" });
});

test("the provenance sidecar is stripped before Mapper output and task args", async () => {
  const { composeFixedTaskPlan } = await loadR4AGreenModule<FixedTaskPlanComposerModule>(
    R4A_GREEN_MODULES.composer,
    "provenance_sidecar_stripped",
  );
  const composed = composeFixedTaskPlan({
    fixedMetadata: aggregateMetadata(),
    fixedQueryTask: aggregateQueryTask(),
    residualTasks: [residualWriteTask()],
  });
  assert.equal(composed.status, "success");
  if (composed.status !== "success") return;

  const plan = mapStructuredOutputToPlan(composed.candidate.output);
  const serializedPlan = JSON.stringify(plan);
  assert.doesNotMatch(serializedPlan, /deterministic_query_boundary|queryScopeProvenance|ownership/);
  for (const task of plan.tasks) {
    assert.equal("queryScopeProvenance" in task.args, false);
    assert.equal("ownership" in task.args, false);
  }
});
