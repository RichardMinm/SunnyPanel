import assert from "node:assert/strict";
import test from "node:test";

import {
  PROJECTABLE_QUERY_SCOPE_CLARIFICATION_CODES,
  projectQueryScopeErrorToClarification,
} from "../../../src/lib/agent/orchestration/query-scope-clarification-projector";
import type { QueryScopeErrorCode } from "../../../src/lib/agent/orchestration/query-scope-contract";

const currentCodes = [
  "aggregate_for_explicit_plan",
  "explicit_plan_id_not_found",
  "id_title_conflict",
  "invalid_aggregate_args",
  "provider_selected_workspace_resource",
  "specific_reference_required",
  "title_ambiguous",
  "title_not_found",
] as const satisfies readonly QueryScopeErrorCode[];

test("projects every current query scope error to an immutable clarification plan", () => {
  for (const code of currentCodes) {
    const result = projectQueryScopeErrorToClarification(code);
    assert.ok(result, code);
    assert.equal(result.queryScopeErrorCode, code);
    assert.equal(result.plan.mode, "single");
    assert.equal(result.plan.tasks.length, 1);
    assert.equal(result.plan.tasks[0]?.intent, "clarify");
    assert.deepEqual(result.plan.tasks[0]?.dependsOn, []);
    assert.equal(result.plan.tasks[0]?.agentRole, "query");
    assert.equal(
      typeof result.plan.tasks[0]?.args.question === "string"
        && result.plan.tasks[0].args.question.trim().length > 0,
      true,
    );
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.plan), true);
    assert.equal(Object.isFrozen(result.plan.tasks), true);
    assert.equal(Object.isFrozen(result.plan.tasks[0]), true);
    assert.equal(Object.isFrozen(result.plan.tasks[0]?.args), true);
  }
});

test("exports an allowlist with every and only current query scope error codes", () => {
  assert.deepEqual(
    [...PROJECTABLE_QUERY_SCOPE_CLARIFICATION_CODES].sort(),
    [...currentCodes].sort(),
  );
});

test("fails closed for a future query scope error code", () => {
  assert.equal(
    projectQueryScopeErrorToClarification(
      "future_query_scope_code" as QueryScopeErrorCode,
    ),
    null,
  );
});

test("fails closed when the exported diagnostics set is externally mutated", () => {
  const futureCode = "future_query_scope_code" as QueryScopeErrorCode;
  const mutableCodes = PROJECTABLE_QUERY_SCOPE_CLARIFICATION_CODES as Set<QueryScopeErrorCode>;
  mutableCodes.add(futureCode);

  try {
    assert.equal(projectQueryScopeErrorToClarification(futureCode), null);
  } finally {
    mutableCodes.delete(futureCode);
  }
});

test("projects no Provider or workspace payload into a clarification plan", () => {
  const forbiddenFragments = [
    "PROVIDER_TASK_ARGS_SENTINEL",
    "WORKSPACE_TITLE_SENTINEL",
    "planId",
    "planTitle",
    "execute",
    "receipt",
    "rollback",
  ];

  for (const code of currentCodes) {
    const result = projectQueryScopeErrorToClarification(code);
    assert.ok(result, code);
    const serialized = JSON.stringify(result);
    for (const fragment of forbiddenFragments) {
      assert.equal(serialized.includes(fragment), false, `${code}: ${fragment}`);
    }
  }
});
