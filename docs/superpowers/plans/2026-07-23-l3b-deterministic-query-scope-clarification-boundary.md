# L3-B Deterministic Query Scope Clarification Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert every current user-correctable Query Scope provenance rejection into one typed, deterministic clarification while keeping the rejected Provider decision observable and every query, write, execution, and persistence boundary closed.

**Architecture:** A new pure query-scope clarification projector maps the closed `QueryScopeErrorCode` allowlist to repository-owned clarification questions and emits one canonical clarify plan. `runLangChainOrchestratorResult()` returns that plan through `status="clarified"` before Resource Readiness or Mapper. Production evidence carries the clarification source and rejected scope code so final-system semantics and Provider deviations are counted separately.

**Tech Stack:** TypeScript, Node test runner, Zod-backed Agent schemas, LangChain structured output, existing SunnyPanel Query Scope validator, orchestration pipeline, and L3-B production Gate.

## Global Constraints

- Do not modify Full or Residual system rules, Prompt examples, semantic contrasts, fixtures, fixture expectations, Structured Output schemas, Provider SDK, model, temperature, timeout, retry, or call budgets.
- Do not modify the Legacy Orchestrator path, runtime defaults, Router adoption, Query adoption, Query allowlists, Payload schema, migrations, LangGraph topology, checkpointing, Specialist, Receipt, or Rollback.
- Do not reinterpret an invalid read as a write, infer a corrected intent, select a workspace resource, or build a natural-language pre-router.
- Do not allow rejected Provider tasks to reach Resource Readiness, Mapper, Query dispatch, Draft, Dry-run, Policy Guard, Confirmation, Executor, task execution, database access, persistence, or business mutation.
- Do not retain raw prompts, raw responses, hidden reasoning, Provider task args, workspace values, secrets, errors, or stacks.
- Do not call DeepSeek, access Keychain, or connect to a database during implementation and deterministic verification.
- Only the eight current `QueryScopeErrorCode` values may project to clarify. Unknown or future codes remain unavailable until explicitly reviewed and added.
- A handled Query Scope clarification is a successful final-system clarify and a separately visible Provider deviation. It is not rewritten as Provider correctness.
- Default Orchestrator and Query Runtime remain Legacy.
- Stability 99 remains blocked until a fresh Acceptance 33 passes.

---

## File Structure

### New file

- `src/lib/agent/orchestration/query-scope-clarification-projector.ts`
  owns only the closed Query Scope error allowlist, repository-owned questions,
  and pure projection to one clarify plan.
- `tests/agent/orchestration/query-scope-clarification-projector.test.ts`
  proves exhaustiveness, immutability, non-empty questions, closed behavior,
  and absence of Provider/workspace data.

### Modified production files

- `src/lib/agent/orchestration/langchain-orchestrator.ts`
  adds the typed query-scope clarified result and invokes the projector before
  Resource Readiness.
- `src/lib/agent/orchestration/l3b-production-gate-model-adapters.ts`
  retains `clarificationSource` and the Query Scope error code as bounded Full
  role evidence.
- `src/lib/agent/orchestration/l3b-production-gate.ts`
  separates deterministic query-scope clarification counts, Provider scope
  deviations, and unhandled zero-tolerance scope failures.

### Modified test and documentation files

- `tests/agent/orchestration/orchestrator-live-semantic-boundary.test.ts`
- `tests/agent/orchestration/langchain-orchestrator.test.ts`
- `tests/agent/orchestration/l3b-production-gate-evaluation.test.ts`
- `tests/agent/orchestration/l3b-production-gate-metrics.test.ts`
- `tests/TEST_MAP.md`

### Explicitly unchanged

- `src/lib/agent/orchestration/query-scope-contract.ts`
- `src/lib/agent/orchestration/orchestrator-dispatcher.ts`
- `src/lib/agent/orchestration/hybrid-production-evaluation.ts`
- `src/lib/agent/orchestration/orchestrator-mapper.ts`
- `scripts/agent-production-seam-gate-eval.mjs`
- every Prompt, fixture, schema, runtime-default, database, execution, and
  LangGraph file.

The existing production evaluator already treats any Full
`status="clarified"` plan as `deterministic_clarify`. The report projector
already spreads bounded Full evidence. Neither needs a behavioral change.

---

### Task 1: Pure Query Scope Clarification Projector

**Files:**
- Create: `src/lib/agent/orchestration/query-scope-clarification-projector.ts`
- Create: `tests/agent/orchestration/query-scope-clarification-projector.test.ts`

**Interfaces:**
- Consumes: `QueryScopeErrorCode` from `query-scope-contract.ts`.
- Produces:

```ts
export const PROJECTABLE_QUERY_SCOPE_CLARIFICATION_CODES:
  ReadonlySet<QueryScopeErrorCode>;

export type QueryScopeClarificationProjection = Readonly<{
  plan: OrchestratorPlan;
  queryScopeErrorCode: QueryScopeErrorCode;
}>;

export const projectQueryScopeErrorToClarification = (
  code: QueryScopeErrorCode,
): QueryScopeClarificationProjection | null;
```

- [ ] **Step 1: Write the failing exhaustive projector tests**

Create
`tests/agent/orchestration/query-scope-clarification-projector.test.ts`.
Import the new projector and define the exact current code set:

```ts
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
```

For every code, assert:

```ts
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
```

Assert the exported allowlist equals `currentCodes` without missing or extra
members:

```ts
assert.deepEqual(
  [...PROJECTABLE_QUERY_SCOPE_CLARIFICATION_CODES].sort(),
  [...currentCodes].sort(),
);
```

Pass a compile-time-cast future code and assert fail-closed behavior:

```ts
assert.equal(
  projectQueryScopeErrorToClarification(
    "future_query_scope_code" as QueryScopeErrorCode,
  ),
  null,
);
```

Serialize every successful projection and assert it contains none of:

```text
PROVIDER_TASK_ARGS_SENTINEL
WORKSPACE_TITLE_SENTINEL
planId
planTitle
execute
receipt
rollback
```

- [ ] **Step 2: Run the projector test and verify RED**

Run:

```bash
PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 AGENT_DISABLE_LLM=1 \
node --import tsx --test \
  tests/agent/orchestration/query-scope-clarification-projector.test.ts
```

Expected: FAIL because
`query-scope-clarification-projector.ts` does not exist.

- [ ] **Step 3: Implement the closed pure projector**

Create
`src/lib/agent/orchestration/query-scope-clarification-projector.ts`.
Use an exhaustive repository-owned question map:

```ts
const questionByCode = Object.freeze({
  aggregate_for_explicit_plan:
    "你提到了具体计划，但查询范围不明确。请确认要查看的计划 ID 或完整标题。",
  explicit_plan_id_not_found:
    "没有找到你提供的计划 ID。请确认计划 ID 或提供准确的计划标题。",
  id_title_conflict:
    "计划 ID 与标题指向不同目标。请确认要查看哪一个计划。",
  invalid_aggregate_args:
    "查询范围包含无法确认的条件。请说明要查看全部进度，还是某个具体计划。",
  provider_selected_workspace_resource:
    "你还没有明确选择具体计划。请提供计划 ID 或准确的完整标题。",
  specific_reference_required:
    "查询具体计划需要明确目标。请提供计划 ID 或准确的完整标题。",
  title_ambiguous:
    "找到多个同名计划。请提供计划 ID 以确认目标。",
  title_not_found:
    "没有找到该计划标题。请确认准确的完整标题或提供计划 ID。",
} satisfies Record<QueryScopeErrorCode, string>);
```

Derive the closed set from the same map:

```ts
export const PROJECTABLE_QUERY_SCOPE_CLARIFICATION_CODES:
  ReadonlySet<QueryScopeErrorCode> = new Set(
    Object.keys(questionByCode) as QueryScopeErrorCode[],
  );
```

Return `null` when the runtime value is not in the set. Otherwise build exactly
one immutable plan:

```ts
{
  mode: "single",
  reasoning: "确定性查询范围澄清：具体查询范围未通过来源校验。",
  source: "llm",
  tasks: [{
    agentRole: "query",
    args: { question: questionByCode[code] },
    dependsOn: [],
    id: "t1",
    intent: "clarify",
    label: "确认查询范围",
  }],
}
```

Freeze the task, task array, plan, and projection. Copy only the error code.
Do not accept a safe message, Provider output, task args, message, or context
as projector input.

- [ ] **Step 4: Run the projector test and verify GREEN**

Run the Step 2 command.

Expected: all projector tests PASS.

- [ ] **Step 5: Commit the pure projector**

```bash
git add \
  src/lib/agent/orchestration/query-scope-clarification-projector.ts \
  tests/agent/orchestration/query-scope-clarification-projector.test.ts
git diff --cached --check
git commit -m "feat(agent): project invalid query scope to clarify"
```

---

### Task 2: Typed LangChain Orchestrator Clarification Result

**Files:**
- Modify: `src/lib/agent/orchestration/langchain-orchestrator.ts:108-129`
- Modify: `src/lib/agent/orchestration/langchain-orchestrator.ts:538-556`
- Modify: `tests/agent/orchestration/orchestrator-live-semantic-boundary.test.ts:120-160`
- Modify: `tests/agent/orchestration/langchain-orchestrator.test.ts:412-460`

**Interfaces:**
- Consumes:

```ts
projectQueryScopeErrorToClarification(
  code: QueryScopeErrorCode,
): QueryScopeClarificationProjection | null;
```

- Produces a second `OrchestratorInvocationResult` clarified variant:

```ts
{
  clarificationSource: "query_scope";
  plan: OrchestratorPlan;
  queryScopeErrorCode: QueryScopeErrorCode;
  schemaValidDecision: OrchestratorDecisionProjection;
  status: "clarified";
}
```

- [ ] **Step 1: Change the three untrusted-scope regressions to RED clarified expectations**

In
`tests/agent/orchestration/orchestrator-live-semantic-boundary.test.ts`,
replace the current unavailable assertions for `qry-4`, `wrt-1`, and `exr-3`
with a table-driven assertion:

```ts
const cases = [
  [
    "qry-4",
    qry4,
    "provider_selected_workspace_resource",
    ["query_plan_progress"],
  ],
  [
    "wrt-1",
    wrt1,
    "specific_reference_required",
    ["query_plan_progress", "compose_plan"],
  ],
  [
    "exr-3",
    exr3,
    "specific_reference_required",
    ["query_plan_progress"],
  ],
] as const;

for (const [fixtureId, result, code, providerIntents] of cases) {
  assert.equal(result.status, "clarified", fixtureId);
  if (result.status !== "clarified") continue;
  assert.equal(result.clarificationSource, "query_scope", fixtureId);
  assert.equal(result.queryScopeErrorCode, code, fixtureId);
  assert.deepEqual(
    result.plan.tasks.map(({ intent }) => intent),
    ["clarify"],
    fixtureId,
  );
  assert.equal(
    typeof result.plan.tasks[0]?.args.question === "string"
      && result.plan.tasks[0].args.question.trim().length > 0,
    true,
    fixtureId,
  );
  assert.deepEqual(result.schemaValidDecision.intents, providerIntents);
}
```

The cases remain:

```text
qry-4 -> provider_selected_workspace_resource -> [query_plan_progress]
wrt-1 -> specific_reference_required -> [query_plan_progress, compose_plan]
exr-3 -> specific_reference_required -> [query_plan_progress]
```

For `wrt-1`, assert the bounded semantic projection retains both ordered
Provider intents while the final plan contains only `clarify`.

- [ ] **Step 2: Change the LangChain unit regression to RED typed clarification**

In `tests/agent/orchestration/langchain-orchestrator.test.ts`, update
`rejects a Provider-selected context plan before the compatibility mapper`.
Assert:

```ts
assert.equal(result.status, "clarified");
if (result.status !== "clarified") return;
assert.equal(result.clarificationSource, "query_scope");
assert.equal(
  result.queryScopeErrorCode,
  "provider_selected_workspace_resource",
);
assert.deepEqual(result.plan.tasks.map(({ intent }) => intent), ["clarify"]);
assert.deepEqual(result.schemaValidDecision, {
  decisionCode: "pure_read_query",
  intents: ["query_plan_progress"],
  mode: "single",
  taskCount: 1,
});
assert.doesNotMatch(
  JSON.stringify(result),
  /planId|101|考研数学复习计划|读取具体计划进度/u,
);
```

Keep the existing resource clarification and unsupported resource-output
tests unchanged. They prove the new variant does not alter resource behavior.

- [ ] **Step 3: Run focused Orchestrator tests and verify RED**

Run:

```bash
PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 AGENT_DISABLE_LLM=1 \
node --import tsx --test \
  tests/agent/orchestration/query-scope-clarification-projector.test.ts \
  tests/agent/orchestration/orchestrator-live-semantic-boundary.test.ts \
  tests/agent/orchestration/langchain-orchestrator.test.ts
```

Expected: projector tests PASS; Orchestrator tests FAIL because Query Scope
rejections still return `status="unavailable"`.

- [ ] **Step 4: Add the typed query-scope clarification branch**

In `langchain-orchestrator.ts`:

1. Import `projectQueryScopeErrorToClarification`.
2. Add the query-scope clarified union member without changing the existing
   resource member.
3. Replace only the invalid Query Scope return branch:

```ts
const clarification = projectQueryScopeErrorToClarification(
  queryScopeResult.code,
);
if (clarification) {
  return {
    clarificationSource: "query_scope",
    plan: clarification.plan,
    queryScopeErrorCode: clarification.queryScopeErrorCode,
    schemaValidDecision,
    status: "clarified",
  };
}

return {
  queryScopeErrorCode: queryScopeResult.code,
  reason: "invalid_query_scope",
  safeMessage: queryScopeResult.safeMessage,
  schemaValidDecision,
  status: "unavailable",
};
```

Do not pass `queryScopeResult.safeMessage`, `result.data`, message, or context
to the projector. Do not continue a clarified branch to Resource Readiness or
Mapper.

`runLangChainOrchestrator()` already returns `result.plan` for both current
non-unavailable states; do not change it. Do not modify
`orchestrator-dispatcher.ts`; the Legacy validation and default remain
unchanged.

- [ ] **Step 5: Run focused Orchestrator tests and verify GREEN**

Run the Step 3 command.

Expected: all focused tests PASS.

- [ ] **Step 6: Commit the typed runtime contract**

```bash
git add \
  src/lib/agent/orchestration/langchain-orchestrator.ts \
  tests/agent/orchestration/orchestrator-live-semantic-boundary.test.ts \
  tests/agent/orchestration/langchain-orchestrator.test.ts
git diff --cached --check
git commit -m "fix(agent): return typed query scope clarifications"
```

---

### Task 3: Bounded Production Evidence and Final Clarify Observation

**Files:**
- Modify: `src/lib/agent/orchestration/l3b-production-gate-model-adapters.ts:69-88`
- Modify: `src/lib/agent/orchestration/l3b-production-gate-model-adapters.ts:137-156`
- Modify: `src/lib/agent/orchestration/l3b-production-gate-model-adapters.ts:369-405`
- Modify: `tests/agent/orchestration/l3b-production-gate-evaluation.test.ts:270-304`
- Modify: `tests/agent/orchestration/l3b-production-gate-evaluation.test.ts:460-504`
- Modify: `tests/agent/orchestration/l3b-production-gate-metrics.test.ts:65-95`

**Interfaces:**
- `ProductionFullRoleEvidence` adds:

```ts
clarificationSource: "query_scope" | "resource_readiness" | null;
```

- Existing fields remain:

```ts
queryScopeErrorCode: QueryScopeErrorCode | null;
resourceIssueCodes: readonly ResourceReadinessErrorCode[];
semanticProjection: OrchestratorDecisionProjection | null;
status: "clarified" | "not_called" | "success" | "unavailable";
```

- [ ] **Step 1: Write the RED production observation for the exact live failure**

Add a second `exr-3` test in
`l3b-production-gate-evaluation.test.ts`. Its fake Full output is:

```ts
fullOutput(
  "pure_read_query",
  "query_plan_progress",
  {},
)
```

Assert:

```ts
assert.equal(observation.branchKind, "deterministic_clarify");
assert.equal(observation.finalMode, "single");
assert.deepEqual(observation.finalTaskIntents, ["clarify"]);
assert.equal(observation.clarifyQuestionPresent, true);
assert.equal(observation.semanticMatch, true);
assert.equal(observation.usable, true);
assert.equal(
  observation.roleEvidence.fullOrchestrator.clarificationSource,
  "query_scope",
);
assert.equal(
  observation.roleEvidence.fullOrchestrator.queryScopeErrorCode,
  "specific_reference_required",
);
assert.deepEqual(
  observation.roleEvidence.fullOrchestrator.semanticProjection?.intents,
  ["query_plan_progress"],
);
assert.deepEqual(
  observation.roleEvidence.fullOrchestrator.resourceIssueCodes,
  [],
);
assert.equal(observation.failureCodes.length, 0);
assert.equal(observation.taskExecutionAttempts, 0);
assert.equal(observation.databaseAccessAttempts, 0);
assert.equal(observation.businessMutationAttempts, 0);
```

Use `assertSafeObservation()` with a query-scope sentinel and assert the
serialized observation contains no Provider args, workspace title, message,
raw response, reasoning, error, stack, or secret.

- [ ] **Step 2: Extend existing evidence tests with source discrimination**

In the existing resource `exr-3` observation test, add:

```ts
assert.equal(
  observation.roleEvidence.fullOrchestrator.clarificationSource,
  "resource_readiness",
);
assert.equal(
  observation.roleEvidence.fullOrchestrator.queryScopeErrorCode,
  null,
);
```

In `Full evidence preserves bounded query-scope and resource categories`,
change the query assertions to:

```ts
assert.equal(queryEvidence.status, "clarified");
assert.equal(queryEvidence.clarificationSource, "query_scope");
assert.equal(
  queryEvidence.queryScopeErrorCode,
  "provider_selected_workspace_resource",
);
assert.deepEqual(queryEvidence.resourceIssueCodes, []);
```

Add to the resource assertions:

```ts
assert.equal(resourceEvidence.status, "clarified");
assert.equal(resourceEvidence.clarificationSource, "resource_readiness");
assert.equal(resourceEvidence.queryScopeErrorCode, null);
```

Add `clarificationSource: null` to the shared
`ProductionGateObservation` factory in
`l3b-production-gate-metrics.test.ts`.

- [ ] **Step 3: Run production evaluation tests and verify RED**

Run:

```bash
PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 AGENT_DISABLE_LLM=1 \
node --import tsx --test \
  tests/agent/orchestration/l3b-production-gate-evaluation.test.ts \
  tests/agent/orchestration/l3b-production-gate-metrics.test.ts
```

Expected: FAIL because Full evidence does not expose
`clarificationSource`, and it currently drops `queryScopeErrorCode` for
`status="clarified"`.

- [ ] **Step 4: Preserve only bounded clarification evidence**

In `l3b-production-gate-model-adapters.ts`:

1. Add the required `clarificationSource` field to
   `ProductionFullRoleEvidence`.
2. Initialize it to `null` in `emptyFullEvidence()`.
3. Populate it without inspecting Provider text:

```ts
clarificationSource:
  result.status === "clarified"
    ? result.clarificationSource
    : null,
```

4. Preserve Query Scope codes for both query-scope clarified and unavailable
   results:

```ts
queryScopeErrorCode:
  "queryScopeErrorCode" in result
    ? result.queryScopeErrorCode ?? null
    : null,
```

5. Keep `failureCode` non-null only for `status="unavailable"`.
6. Keep `resourceIssueCodes` copied only from the typed result field.
7. Keep `semanticProjection` restricted to decision code, ordered intents,
   mode, and task count.

Do not add safe messages, questions, Provider args, workspace values, errors,
or stacks to evidence. Do not modify the production evaluator: its existing
general clarified path must produce the final clarify observation.

- [ ] **Step 5: Run production evaluation tests and verify GREEN**

Run the Step 3 command.

Expected: all production evaluation and metrics-construction tests PASS.

- [ ] **Step 6: Commit bounded evidence**

```bash
git add \
  src/lib/agent/orchestration/l3b-production-gate-model-adapters.ts \
  tests/agent/orchestration/l3b-production-gate-evaluation.test.ts \
  tests/agent/orchestration/l3b-production-gate-metrics.test.ts
git diff --cached --check
git commit -m "test(agent): expose query scope clarification evidence"
```

---

### Task 4: Final-System and Provider-Deviation Gate Accounting

**Files:**
- Modify: `src/lib/agent/orchestration/l3b-production-gate.ts:53-94`
- Modify: `src/lib/agent/orchestration/l3b-production-gate.ts:209-246`
- Modify: `src/lib/agent/orchestration/l3b-production-gate.ts:259-350`
- Modify: `src/lib/agent/orchestration/l3b-production-gate.ts:504-540`
- Modify: `tests/agent/orchestration/l3b-production-gate-metrics.test.ts:534-627`
- Modify: `tests/TEST_MAP.md:84-85`

**Interfaces:**
- `ProductionGateMetrics.business` adds:

```ts
deterministicQueryScopeClarifications: number;
```

- `ProductionGateProviderMetrics` adds:

```ts
queryScopeDeviations: number;
```

- Existing `zeroTolerance.invalidQueryScopeProvenance` remains the Gate for
  unhandled Query Scope failures.

- [ ] **Step 1: Write the RED split-accounting test**

In `l3b-production-gate-metrics.test.ts`, add:

```ts
test("separates deterministic query-scope clarification from Provider deviation diagnostics", () => {
  const base = observation("exr-3", 1, 1);
  const clarified = observation("exr-3", 1, 1, {
    branchKind: "deterministic_clarify",
    clarifyQuestionPresent: true,
    finalDependencies: [{ dependsOn: [], taskId: "t1" }],
    finalMode: "single",
    finalTaskIntents: ["clarify"],
    roleEvidence: {
      ...base.roleEvidence,
      fullOrchestrator: {
        ...base.roleEvidence.fullOrchestrator,
        clarificationSource: "query_scope",
        completedResponses: 1,
        providerAttempts: 1,
        queryScopeErrorCode: "specific_reference_required",
        semanticProjection: {
          decisionCode: "pure_read_query",
          intents: ["query_plan_progress"],
          mode: "single",
          taskCount: 1,
        },
        semanticValidationPasses: 1,
        semanticValidationsCompleted: 1,
        status: "clarified",
        strictSchemaPasses: 1,
      },
    },
    semanticMatch: true,
    usable: true,
  });

  const metrics = computeProductionGateMetrics({
    observations: [clarified],
    providerEvents: [],
    stage: "acceptance",
  });

  assert.equal(metrics.business.deterministicQueryScopeClarifications, 1);
  assert.equal(metrics.business.deterministicResourceClarifications, 0);
  assert.equal(metrics.provider.queryScopeDeviations, 1);
  assert.equal(metrics.provider.resourceReferenceDeviations, 0);
  assert.equal(metrics.zeroTolerance.invalidQueryScopeProvenance, 0);
  assert.equal(metrics.zeroTolerance.clarifyToWriteEscalations, 0);
  assert.equal(metrics.zeroTolerance.unexpectedWriteCandidates, 0);
});
```

Update the existing resource clarification test to assert:

```ts
assert.equal(metrics.business.deterministicQueryScopeClarifications, 0);
assert.equal(metrics.provider.queryScopeDeviations, 0);
```

- [ ] **Step 2: Write the RED unhandled-scope zero-tolerance test**

Construct an unavailable observation:

```ts
const unavailable = observation("exr-3", 1, 1, {
  branchKind: "unavailable",
  clarifyQuestionPresent: false,
  failureCodes: ["full_invalid_query_scope"],
  finalDependencies: [],
  finalMode: null,
  finalTaskIntents: [],
  roleEvidence: {
    ...base.roleEvidence,
    fullOrchestrator: {
      ...base.roleEvidence.fullOrchestrator,
      clarificationSource: null,
      completedResponses: 1,
      failureCode: "invalid_query_scope",
      providerAttempts: 1,
      queryScopeErrorCode: "specific_reference_required",
      semanticProjection: {
        decisionCode: "pure_read_query",
        intents: ["query_plan_progress"],
        mode: "single",
        taskCount: 1,
      },
      semanticValidationPasses: 1,
      semanticValidationsCompleted: 1,
      status: "unavailable",
      strictSchemaPasses: 1,
    },
  },
  semanticMatch: false,
  usable: false,
});
```

Assert:

```ts
assert.equal(metrics.business.deterministicQueryScopeClarifications, 0);
assert.equal(metrics.provider.queryScopeDeviations, 0);
assert.equal(metrics.zeroTolerance.invalidQueryScopeProvenance, 1);
assert.equal(
  evaluateProductionGateThresholds(metrics).includes(
    "invalid_query_scope_provenance",
  ),
  true,
);
```

This preserves fail-closed behavior if projection is unavailable or a future
code is not allowlisted.

- [ ] **Step 3: Run Gate metrics tests and verify RED**

Run:

```bash
PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 AGENT_DISABLE_LLM=1 \
node --import tsx --test \
  tests/agent/orchestration/l3b-production-gate-metrics.test.ts
```

Expected: FAIL because the split metrics do not exist and every non-null Query
Scope error currently increments the zero-tolerance Gate.

- [ ] **Step 4: Implement source-specific classification helpers**

In `l3b-production-gate.ts`, replace the current status-only resource helper
with three explicit helpers:

```ts
const isFullClarification = (
  observation: ProductionGateObservation,
): boolean =>
  observation.roleEvidence.fullOrchestrator.status === "clarified";

const isQueryScopeClarification = (
  observation: ProductionGateObservation,
): boolean =>
  isFullClarification(observation)
  && observation.roleEvidence.fullOrchestrator.clarificationSource
    === "query_scope";

const isResourceClarification = (
  observation: ProductionGateObservation,
): boolean =>
  isFullClarification(observation)
  && observation.roleEvidence.fullOrchestrator.clarificationSource
    === "resource_readiness";
```

Use `isFullClarification()` in `actualIntents()` so every deterministic
clarification is classified from final `["clarify"]`, never from rejected
Provider intents.

Keep resource issue exclusions restricted to
`isResourceClarification()`. Do not let a query-scope clarification suppress
an unrelated resource issue.

- [ ] **Step 5: Split final-system and Provider metrics**

Change `invalidQueryScopeProvenance` to exclude only handled query-scope
clarifications:

```ts
invalidQueryScopeProvenance: input.observations.filter((observation) =>
  !isQueryScopeClarification(observation)
  && (
    observation.roleEvidence.fullOrchestrator.queryScopeErrorCode !== null
    || observation.failureCodes.includes("full_invalid_query_scope")
  )
).length,
```

Add:

```ts
business: Object.freeze({
  deterministicQueryScopeClarifications: input.observations.filter(
    isQueryScopeClarification,
  ).length,
  deterministicResourceClarifications: input.observations.filter(
    isResourceClarification,
  ).length,
  // existing fields unchanged
}),
```

and:

```ts
queryScopeDeviations: input.observations.filter(
  (observation) =>
    isQueryScopeClarification(observation)
    && observation.roleEvidence.fullOrchestrator.queryScopeErrorCode !== null,
).length,
```

Do not add either diagnostic counter to `zeroToleranceReasons`. Keep
`invalidQueryScopeProvenance` in `zeroToleranceReasons` for unhandled cases.

- [ ] **Step 6: Run Gate metrics tests and verify GREEN**

Run the Step 3 command.

Expected: all Gate metrics tests PASS.

- [ ] **Step 7: Update the deterministic test map**

Add one protected row to `tests/TEST_MAP.md`:

```markdown
| **Deterministic Query Scope Clarification Boundary (L3-B)** | `tests/agent/orchestration/query-scope-clarification-projector.test.ts`, `tests/agent/orchestration/orchestrator-live-semantic-boundary.test.ts`, `tests/agent/orchestration/langchain-orchestrator.test.ts`, `tests/agent/orchestration/l3b-production-gate-evaluation.test.ts`, `tests/agent/orchestration/l3b-production-gate-metrics.test.ts` | Every current Query Scope provenance rejection can produce one typed deterministic clarify before Resource Readiness or Mapper; future codes remain unavailable. Final-system semantic and safety metrics use the projected clarify plan, while sanitized Provider scope code and intent projection remain separately visible through non-gating deviation counters. Rejected query tasks cannot reach Query dispatch, Mapper, Draft, Dry-run, execution, database, or business mutation. No raw Prompt, response, reasoning, workspace value, or secret is retained, and the default Orchestrator remains Legacy. | protected |
```

- [ ] **Step 8: Commit Gate accounting**

```bash
git add \
  src/lib/agent/orchestration/l3b-production-gate.ts \
  tests/agent/orchestration/l3b-production-gate-metrics.test.ts \
  tests/TEST_MAP.md
git diff --cached --check
git commit -m "test(agent): separate query scope clarification diagnostics"
```

---

### Task 5: Deterministic Closure Verification and No-Network Preflight

**Files:**
- Verify only. Modify only Task 1–4 scoped files if a deterministic regression
  exposes a direct contract defect.

**Interfaces:**
- Consumes all Task 1–4 commits.
- Produces a clean implementation HEAD ready for a separately approved
  Acceptance 33 run.

- [ ] **Step 1: Run focused Query Scope and production contracts**

```bash
PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 AGENT_DISABLE_LLM=1 \
node --import tsx --test \
  tests/agent/orchestration/query-scope-clarification-projector.test.ts \
  tests/agent/orchestration/query-scope-provenance.test.ts \
  tests/agent/orchestration/query-boundary-provenance.test.ts \
  tests/agent/orchestration/resource-clarification-projector.test.ts \
  tests/agent/orchestration/resource-readiness-guard.test.ts \
  tests/agent/orchestration/orchestrator-live-semantic-boundary.test.ts \
  tests/agent/orchestration/langchain-orchestrator.test.ts \
  tests/agent/orchestration/orchestrator-dispatcher.test.ts \
  tests/agent/orchestration/l3b-production-gate-evaluation.test.ts \
  tests/agent/orchestration/l3b-production-gate-metrics.test.ts
```

Expected: all focused tests PASS. No network, Keychain, database, execution,
or persistence path is used.

- [ ] **Step 2: Run TypeScript and Agent baselines**

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run typecheck
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:agent
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:agent:planning
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:agent:schedule
```

Expected: every command exits zero without Provider or database access.

- [ ] **Step 3: Run content, lint, and whitespace validation**

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:content
npm run lint
npx eslint . --ignore-pattern '.claude/worktrees/**'
git diff --check
```

Expected: tests and type/lint checks exit zero; existing warnings may remain,
but no new errors are introduced.

- [ ] **Step 4: Verify prohibited files and runtime defaults**

```bash
git diff --name-only c4d1122469dbe01a916312af7f8eb56b3db0813a..HEAD
git grep -n "DEFAULT_ORCHESTRATOR_RUNTIME" \
  src/lib/agent/orchestration/runtime-config.ts
git status --short --branch
```

Expected changed implementation files are limited to:

```text
src/lib/agent/orchestration/query-scope-clarification-projector.ts
src/lib/agent/orchestration/langchain-orchestrator.ts
src/lib/agent/orchestration/l3b-production-gate-model-adapters.ts
src/lib/agent/orchestration/l3b-production-gate.ts
tests/agent/orchestration/query-scope-clarification-projector.test.ts
tests/agent/orchestration/orchestrator-live-semantic-boundary.test.ts
tests/agent/orchestration/langchain-orchestrator.test.ts
tests/agent/orchestration/l3b-production-gate-evaluation.test.ts
tests/agent/orchestration/l3b-production-gate-metrics.test.ts
tests/TEST_MAP.md
```

The implementation plan document itself may also appear in the commit range.
No Prompt, fixture, schema, runtime-default, Provider, database, Mapper,
execution, migration, or LangGraph file may appear. The worktree must be
clean.

- [ ] **Step 5: Preserve the failed Acceptance evidence**

Before no-network preflight, preserve the current baseline report without
reading or rewriting it:

```bash
test -e /tmp/l3b-r8-production-acceptance.json
test ! -e /tmp/l3b-r8-production-acceptance-bdb912056fb09a47.json
mv \
  /tmp/l3b-r8-production-acceptance.json \
  /tmp/l3b-r8-production-acceptance-bdb912056fb09a47.json
chmod 600 /tmp/l3b-r8-production-acceptance-bdb912056fb09a47.json
```

Expected: the fixed Acceptance report path is absent and the archived report
remains mode `0600`. Do not delete any report.

- [ ] **Step 6: Run no-network Acceptance preflight**

Capture the implementation HEAD:

```bash
L3B_QUERY_SCOPE_IMPLEMENTATION_HEAD="$(git rev-parse HEAD)"
```

Then run:

```bash
env \
  -u DATABASE_URL \
  -u AGENT_DISABLE_LLM \
  AGENT_PRODUCTION_SEAM_EVAL=1 \
  AGENT_LIVE_LLM_EVAL=1 \
  L3B_PRODUCTION_PROVIDER_DATA_APPROVED=1 \
  L3B_PRODUCTION_GATE_STAGE=acceptance \
  L3B_PRODUCTION_GATE_ACCEPTED_HEAD="$L3B_QUERY_SCOPE_IMPLEMENTATION_HEAD" \
  L3B_PRODUCTION_GATE_ACCEPTED_CONFIG_HASH=4d50c829aa5dc290acfdbed050a8be36359a83ff7c299b8da9754e657a651405 \
  L3B_PRODUCTION_GATE_PREFLIGHT_ONLY=1 \
  PAYLOAD_SECRET=sunnypanel-agent-preflight-only-secret-2026 \
  node --import tsx scripts/agent-production-seam-gate-eval.mjs
```

Expected:

- status `ready`;
- stage `acceptance`;
- observations `33`;
- maximum logical calls `34`;
- maximum Provider attempts `65`;
- actual Provider attempts `0`;
- exact implementation HEAD;
- evaluation config hash
  `4d50c829aa5dc290acfdbed050a8be36359a83ff7c299b8da9754e657a651405`;
- no report written at the fixed path;
- no Keychain access, Provider request, or database connection.

- [ ] **Step 7: Stop for new Provider disclosure approval**

Report:

- implementation commits and clean HEAD;
- focused and full deterministic results;
- unchanged default Runtime;
- no Provider, database, execution, or mutation during implementation;
- preflight hashes and budgets;
- the unchanged 33 synthetic messages and synthetic workspace contexts;
- unchanged Full/Residual system rules and strict schemas;
- up to five consultation Answer Renderer calls;
- maximum `34` logical calls and `65` Provider attempts.

Do not run Acceptance 33 until the user gives new informed approval tied to
the new implementation HEAD. Do not start Stability 99.
