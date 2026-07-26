# L3-B Schedule-Plan Deterministic Binding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one explicit actor-authorized user plan ID authoritative for the supported single-task `schedule_plan` path, so a Provider copy error is deterministically corrected without weakening any rejection or execution boundary.

**Architecture:** Extend the existing pure schedule-reference contract from validation-only to validation-plus-normalization. Validate the user message and actor-authorized Context first, immutably replace only the Provider-supplied `planId` when all trust conditions pass, then let the existing Resource Readiness Guard and compatibility Mapper consume the normalized output. Project only one bounded correction code into runtime and evaluation evidence; keep correction counts observational and non-gating.

**Tech Stack:** TypeScript, Zod-derived `OrchestratorOutput`, LangChain fake model adapters, Node.js test runner, existing L3-B Production Gate harness.

## Global Constraints

- Work only in `/Users/richardluo/Documents/Develop/SunnyPanel/.worktrees/phase-l3b-authoritative-orchestrator` on `phase/l3b-r4a-query-boundary`.
- The approved design is `docs/superpowers/specs/2026-07-23-l3b-schedule-plan-deterministic-binding-design.md`.
- Apply deterministic rebinding only to `mode = "single"`, exactly one task, and `intent = "schedule_plan"`.
- Require exactly one explicit positive plan ID from the original user message, membership in actor-authorized Context, and no conflicting exact-title evidence.
- Missing, multiple, outside, placeholder, title-only, multiple exact-title,
  title-conflict, compound, schema-invalid, and non-`schedule_plan` cases must
  not rebind.
- Do not modify the Full or Residual Prompt, contrastive examples, structured schemas, `SchedulePlanArgs`, Provider configuration, timeout, retry, output budget, or Gate thresholds.
- Do not modify Query Scope, Resource Readiness semantics, the compatibility Mapper contract, LangGraph topology, checkpoints, Draft, Dry-run, Policy, Confirmation, Executor, Receipt, Rollback, Payload schema, or migrations.
- Do not add a model call, database access, task execution, business mutation, dependency, Legacy fallback, or default-runtime switch.
- Keep Legacy authoritative by default. Do not adopt LangChain or remove Legacy.
- Do not run a real Provider request during implementation or deterministic verification.
- Preserve `/tmp/l3b-r8-production-known-id.json`, `/tmp/l3b-r8-production-known-id-v2.json`, and `/tmp/l3b-r8-production-known-id-v3.json`; do not read, delete, overwrite, or reuse their contents.
- Reserve `/tmp/l3b-r8-production-known-id-v4.json` for a later separately approved live Gate. No-network preflight must not create it.
- Persist no original or normalized plan ID, plan title, user message, Provider output, prompt, response, reasoning, task ID, stack trace, or secret in the sanitized report.
- Keep the Known-ID fixture IDs, order, one round, six observations, six-logical-call maximum, and 24-Provider-attempt maximum unchanged.
- Use TDD for each code task and commit each independently. Do not push.

---

## File Structure

- `src/lib/agent/orchestration/schedule-plan-reference-contract.ts`
  owns trusted schedule-plan reference validation, immutable `planId`
  normalization, internal provenance, and internal correction metadata.
- `src/lib/agent/orchestration/schedule-plan-reference-clarification-projector.ts`
  remains the single sanitized projector for the schedule-reference errors that
  still fail closed; its source behavior does not change.
- `src/lib/agent/orchestration/langchain-orchestrator.ts`
  passes the normalized output to Resource Readiness and the Mapper, and
  exposes only the bounded correction code on successful runtime results.
- `src/lib/agent/orchestration/l3b-production-gate-model-adapters.ts`
  projects the bounded correction code into sanitized Full-role evidence.
- `src/lib/agent/orchestration/hybrid-production-evaluation.ts`
  retains its existing final-business-result classification; no production
  change is expected because the normalized plan already reaches it.
- `src/lib/agent/orchestration/l3b-production-gate.ts`
  aggregates a non-gating correction counter without changing any threshold.
- `scripts/agent-production-seam-gate-eval.mjs`
  reserves the exclusive v4 report path and strengthens persisted-report
  retention checks.
- Focused test files lock the pure contract, runtime flow, sanitized evidence,
  Known-ID business classification, metrics, report versioning, and preflight.
- `tests/TEST_MAP.md` records the new deterministic authority boundary and v4
  report contract.

---

### Task 1: Pure Schedule Reference Validation and Immutable Normalization

**Files:**
- Modify: `src/lib/agent/orchestration/schedule-plan-reference-contract.ts`
- Test: `tests/agent/orchestration/schedule-plan-reference-contract.test.ts`
- Test: `tests/agent/orchestration/schedule-plan-reference-clarification-projector.test.ts`

**Interfaces:**
- Consumes: `analyzePlanReferenceEvidence({ context, message })`,
  `AgentPromptContext`, and schema-valid `OrchestratorOutput`.
- Produces:

```ts
export type SchedulePlanReferenceCorrectionCode =
  "provider_plan_id_rebound";

export type SchedulePlanReferenceCorrection = Readonly<{
  code: SchedulePlanReferenceCorrectionCode;
  taskId: string;
}>;

export type SchedulePlanReferenceValidationResult =
  | Readonly<{
      corrections: readonly SchedulePlanReferenceCorrection[];
      output: OrchestratorOutput;
      provenances: readonly SchedulePlanReferenceProvenance[];
      valid: true;
    }>
  | Readonly<{
      code: SchedulePlanReferenceErrorCode;
      safeMessage: string;
      valid: false;
    }>;
```

- `provider_plan_id_mismatch` is removed from
  `SchedulePlanReferenceErrorCode`; a Provider copy mismatch becomes the
  bounded success correction only after the user reference is trusted.
- Every valid branch returns `corrections`, including an empty frozen array for
  non-schedule, matching-ID, and unsupported-compound passthroughs.

- [ ] **Step 1: Replace the old mismatch rejection test with a failing normalization test**

Add this test beside the existing accepted-provenance cases:

```ts
test("rebinds a Provider plan ID to the one explicit authorized user ID", () => {
  const providerOutput = output(999);
  const result = validateSchedulePlanReferences({
    context,
    message: "把计划 101 安排到下周",
    output: providerOutput,
  });

  assert.equal(result.valid, true);
  if (!result.valid) return;
  assert.deepEqual(result.output.tasks[0]?.args, { planId: 101 });
  assert.deepEqual(providerOutput.tasks[0]?.args, { planId: 999 });
  assert.notEqual(result.output, providerOutput);
  assert.notEqual(result.output.tasks[0], providerOutput.tasks[0]);
  assert.deepEqual(result.corrections, [{
    code: "provider_plan_id_rebound",
    taskId: "t1",
  }]);
  assert.deepEqual(result.provenances, [{
    planId: 101,
    source: "explicit_plan_id",
    taskId: "t1",
  }]);
});
```

Remove the old tuple that expects `provider_plan_id_mismatch` from
`"rejects invalid single-task schedule references deterministically"`.

- [ ] **Step 2: Make matching and passthrough tests require zero corrections**

Extend the matching-ID test:

```ts
assert.equal(result.output, outputPassedToValidator);
assert.deepEqual(result.corrections, []);
```

Use a named `outputPassedToValidator` variable so identity can be asserted.
Update the non-schedule and compound expected results to include:

```ts
corrections: [],
```

Keep the compound result identical to the input object.

- [ ] **Step 3: Add failing tests that forbidden references never rebind**

Keep the existing missing, multiple, outside, multiple-title, and title-conflict
cases, and assert their exact error codes. Add an explicit immutability check
for the outside-ID case:

```ts
const outsideOutput = output(102);
const outsideResult = validateSchedulePlanReferences({
  context: { ...context, plans: context.plans.slice(0, 1) },
  message: "把计划 999 安排到下周",
  output: outsideOutput,
});

assert.equal(outsideResult.valid, false);
if (outsideResult.valid) return;
assert.equal(outsideResult.code, "explicit_plan_id_not_in_context");
assert.deepEqual(outsideOutput.tasks[0]?.args, { planId: 102 });
```

The important order is that the untrusted user ID fails before any comparison
with, or repair of, the Provider ID.

- [ ] **Step 4: Run the pure contract tests and verify RED**

Run:

```bash
env -u DATABASE_URL PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 AGENT_DISABLE_LLM=1 \
  node --import tsx --test \
  tests/agent/orchestration/schedule-plan-reference-contract.test.ts \
  tests/agent/orchestration/schedule-plan-reference-clarification-projector.test.ts
```

Expected: the new normalization and `corrections` assertions fail because the
current contract still returns `provider_plan_id_mismatch` and valid branches
do not expose corrections.

- [ ] **Step 5: Add correction types and remove the obsolete mismatch error**

In `schedule-plan-reference-contract.ts`, add:

```ts
export type SchedulePlanReferenceCorrectionCode =
  "provider_plan_id_rebound";

export type SchedulePlanReferenceCorrection = Readonly<{
  code: SchedulePlanReferenceCorrectionCode;
  taskId: string;
}>;
```

Remove `"provider_plan_id_mismatch"` from
`SchedulePlanReferenceErrorCode` and remove its entry from
`safeMessageByCode`. Remove the same code from the clarification projector
test's exhaustive `codes` array. Do not change the projector implementation or
the safe copy for the remaining errors.

- [ ] **Step 6: Add `corrections` to every valid return**

Create one reusable frozen empty array:

```ts
const NO_CORRECTIONS =
  Object.freeze([]) as readonly SchedulePlanReferenceCorrection[];
```

Return `corrections: NO_CORRECTIONS` from the no-schedule and unsupported
compound passthrough branches, and from accepted matching-ID results.

- [ ] **Step 7: Reorder trust validation and implement immutable normalization**

After verifying exactly one explicit ID, validate in this exact order:

```ts
const explicitPlanId = evidence.explicitPlanIds[0]!;
if (!evidence.trustedPlans.some(({ id }) => id === explicitPlanId)) {
  return invalid("explicit_plan_id_not_in_context");
}

const exactTitlePlanIds = new Set(
  evidence.exactTitlePlans.map(({ id }) => id),
);
if (exactTitlePlanIds.size > 1) {
  return invalid("multiple_exact_plan_titles");
}
if (
  exactTitlePlanIds.size === 1
  && !exactTitlePlanIds.has(explicitPlanId)
) {
  return invalid("plan_id_title_conflict");
}
```

Only after those checks, normalize a differing Provider ID:

```ts
const correctionRequired = task.args.planId !== explicitPlanId;
const normalizedTask = correctionRequired
  ? Object.freeze({
      ...task,
      args: Object.freeze({
        ...task.args,
        planId: explicitPlanId,
      }),
    })
  : task;
const normalizedOutput = correctionRequired
  ? Object.freeze({
      ...input.output,
      tasks: Object.freeze([normalizedTask]),
    }) as OrchestratorOutput
  : input.output;
const corrections = correctionRequired
  ? Object.freeze([
      Object.freeze({
        code: "provider_plan_id_rebound" as const,
        taskId: task.id,
      }),
    ])
  : NO_CORRECTIONS;
```

Return `normalizedOutput`, the existing trusted provenance, and `corrections`.
Never mutate `input.output`, `task`, or `task.args`.

- [ ] **Step 8: Run the pure contract tests and verify GREEN**

Run the command from Step 4 again.

Expected: all schedule contract and clarification projector tests pass; no
Provider or database is called.

- [ ] **Step 9: Typecheck the Task 1 boundary**

Run:

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run typecheck
```

Expected: PASS. Any exhaustive consumer of the removed error code must be
updated only if it is part of the schedule-reference typed boundary.

- [ ] **Step 10: Commit Task 1**

```bash
git add \
  src/lib/agent/orchestration/schedule-plan-reference-contract.ts \
  tests/agent/orchestration/schedule-plan-reference-contract.test.ts \
  tests/agent/orchestration/schedule-plan-reference-clarification-projector.test.ts
git diff --cached --check
git commit -m "fix(agent): bind schedules to explicit plan ids"
```

---

### Task 2: Runtime Consumption and Bounded Full-Role Evidence

**Files:**
- Modify: `src/lib/agent/orchestration/langchain-orchestrator.ts`
- Modify: `src/lib/agent/orchestration/l3b-production-gate-model-adapters.ts`
- Test: `tests/agent/orchestration/langchain-orchestrator.test.ts`
- Test: `tests/agent/orchestration/l3b-production-gate-evaluation.test.ts`

**Interfaces:**
- Consumes:

```ts
scheduleReferenceResult.output
scheduleReferenceResult.corrections
```

from Task 1.
- Produces this required property on successful runtime results:

```ts
schedulePlanReferenceCorrectionCode:
  SchedulePlanReferenceCorrectionCode | null;
```

- Produces the same bounded property on `ProductionFullRoleEvidence`.
- Never exposes `SchedulePlanReferenceCorrection.taskId` outside the pure
  contract.
- Resource Readiness and `mapStructuredOutputToPlan()` consume only
  `scheduleReferenceResult.output`.

- [ ] **Step 1: Write a failing Orchestrator test for an invalid Provider copy and a valid user ID**

Add a fake-model test next to the existing schedule-reference tests:

```ts
it("normalizes a Provider schedule ID before Resource Readiness and mapping", async () => {
  const result = await runLangChainOrchestratorResult({
    context: {
      checklists: [],
      now: "2026-07-26T12:00:00.000+08:00",
      pendingAction: null,
      plans: [{
        id: 101,
        priority: "medium",
        state: "active",
        title: "考研数学复习计划",
      }],
    },
    message: "把计划 101 安排到下周",
    modelConfig: {
      apiKey: "test-only",
      baseURL: "https://example.invalid",
      maxRetries: 0,
      model: "fake",
      provider: "deepseek",
      structuredOutputMode: "provider_default",
      temperature: 0,
      timeoutMs: 100,
    },
    modelFactory: promptJsonModelFactory(() => ({
      decisionCode: "explicit_write_ready",
      mode: "single",
      routingSummary: "schedule selected plan",
      tasks: [{
        agentRole: "schedule",
        args: { planId: 999, startDate: "2026-08-03" },
        dependsOn: [],
        id: "t1",
        intent: "schedule_plan",
        label: "schedule selected plan",
      }],
      version: 2,
    })),
    structuredRetryBudget: { schema: 0, transport: 0 },
  });

  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  assert.deepEqual(result.plan.tasks[0]?.args, {
    planId: 101,
    startDate: "2026-08-03",
  });
  assert.equal(
    result.schedulePlanReferenceCorrectionCode,
    "provider_plan_id_rebound",
  );
  assert.equal(JSON.stringify(result).includes("999"), false);
});
```

Using Provider ID `999` proves the normalized output reaches Resource
Readiness: the old output would be rejected before the Mapper. The final plan
args prove the Mapper received ID `101`.

- [ ] **Step 2: Require `null` correction evidence on an unchanged schedule**

In the existing `"keeps a generic descriptor plus exact authorized ID as schedule_plan"`
test, add:

```ts
assert.equal(result.schedulePlanReferenceCorrectionCode, null);
assert.deepEqual(result.plan.tasks[0]?.args, { planId: 101 });
```

- [ ] **Step 3: Run the focused Orchestrator test and verify RED**

Run:

```bash
env -u DATABASE_URL PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 AGENT_DISABLE_LLM=1 \
  node --import tsx --test \
  tests/agent/orchestration/langchain-orchestrator.test.ts
```

Expected: the runtime success property is missing and/or the old Provider ID
cannot complete the schedule path.

- [ ] **Step 4: Add the bounded success property to the runtime union**

Import `SchedulePlanReferenceCorrectionCode` from the Task 1 contract and
change only the success variant:

```ts
| {
    status: "success";
    plan: OrchestratorPlan;
    schedulePlanReferenceCorrectionCode:
      SchedulePlanReferenceCorrectionCode | null;
    schemaValidDecision?: OrchestratorDecisionProjection;
  }
```

Do not add correction IDs, resource values, or task IDs to clarified or
unavailable variants.

- [ ] **Step 5: Return the bounded code after mapping the normalized output**

Keep:

```ts
const scheduleReferenceValidatedOutput = scheduleReferenceResult.output;
```

as the sole input to Resource Readiness and the Mapper. Replace the final
success return with:

```ts
return {
  plan,
  schedulePlanReferenceCorrectionCode:
    scheduleReferenceResult.corrections[0]?.code ?? null,
  schemaValidDecision,
  status: "success",
};
```

Do not return the corrections array or provenance from the runtime.

- [ ] **Step 6: Add the bounded property to Full-role evidence**

Import `SchedulePlanReferenceCorrectionCode` alongside
`SchedulePlanReferenceErrorCode`, add:

```ts
schedulePlanReferenceCorrectionCode:
  SchedulePlanReferenceCorrectionCode | null;
```

to `ProductionFullRoleEvidence`, initialize it to `null` in
`emptyFullEvidence()`, and project it with:

```ts
schedulePlanReferenceCorrectionCode:
  result.status === "success"
    ? result.schedulePlanReferenceCorrectionCode
    : null,
```

Keep `schedulePlanReferenceErrorCode` for genuine clarified failures.

- [ ] **Step 7: Add a failing bounded-evidence test**

In `l3b-production-gate-evaluation.test.ts`, construct a Full adapter whose
fake Provider emits `schedule_plan` with `planId: 999`, invoke it with the
canonical `diag-plan-existing-id` message and Context, then assert:

```ts
const evidence = adapter.getRoleEvidence();
assert.equal(evidence.status, "success");
assert.equal(
  evidence.schedulePlanReferenceCorrectionCode,
  "provider_plan_id_rebound",
);
assert.equal(evidence.schedulePlanReferenceErrorCode, null);
assert.equal(JSON.stringify(evidence).includes("999"), false);
assert.equal(JSON.stringify(evidence).includes("\"planId\""), false);
assert.equal(JSON.stringify(evidence).includes("\"taskId\""), false);
```

Also update every literal `ProductionFullRoleEvidence` fixture in the metrics
tests to set `schedulePlanReferenceCorrectionCode: null`.

- [ ] **Step 8: Run runtime and evidence tests and verify GREEN**

Run:

```bash
env -u DATABASE_URL PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 AGENT_DISABLE_LLM=1 \
  node --import tsx --test \
  tests/agent/orchestration/langchain-orchestrator.test.ts \
  tests/agent/orchestration/l3b-production-gate-evaluation.test.ts \
  tests/agent/orchestration/l3b-production-gate-metrics.test.ts
```

Expected: PASS with fake models only; no API, database, execution, or mutation.

- [ ] **Step 9: Typecheck Task 2**

Run:

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run typecheck
```

Expected: PASS, including all success-result and Full-evidence consumers.

- [ ] **Step 10: Commit Task 2**

```bash
git add \
  src/lib/agent/orchestration/langchain-orchestrator.ts \
  src/lib/agent/orchestration/l3b-production-gate-model-adapters.ts \
  tests/agent/orchestration/langchain-orchestrator.test.ts \
  tests/agent/orchestration/l3b-production-gate-evaluation.test.ts \
  tests/agent/orchestration/l3b-production-gate-metrics.test.ts
git diff --cached --check
git commit -m "fix(agent): project schedule binding corrections"
```

---

### Task 3: Known-ID Classification, Non-Gating Metrics, and v4 Report Contract

**Files:**
- Modify: `src/lib/agent/orchestration/l3b-production-gate.ts`
- Modify: `scripts/agent-production-seam-gate-eval.mjs`
- Test: `tests/agent/orchestration/l3b-production-gate-evaluation.test.ts`
- Test: `tests/agent/orchestration/l3b-production-gate-metrics.test.ts`
- Test: `tests/agent/orchestration/l3b-production-gate-contract.test.ts`
- Modify: `tests/TEST_MAP.md`

**Interfaces:**
- Consumes:

```ts
observation.roleEvidence.fullOrchestrator
  .schedulePlanReferenceCorrectionCode
```

- Produces this observational, non-gating metric:

```ts
providerPlanIdRebounds: number;
```

inside `ProductionGateProviderMetrics`.
- Keeps `classifyKnownIdOutcome()` unchanged unless the RED test proves a
  defect; its current exact-reference classification should accept the final
  normalized `schedule_plan`.
- Persists the bounded correction code through the existing sanitized
  `roleEvidence` projection.
- Uses `/tmp/l3b-r8-production-known-id-v4.json` for the next exclusive report.

- [ ] **Step 1: Make both exact-reference diagnostics fail RED on a Provider copy error**

Replace or extend the existing exact-reference Known-ID test with this table:

```ts
for (const fixtureId of [
  "diag-plan-existing-id",
  "diag-plan-title-valid-id",
] as const) {
  const { observation } = await evaluateKnownId(
    fixtureId,
    () => fullOutput(
      "explicit_write_ready",
      "schedule_plan",
      { planId: 999, startDate: "2026-07-21" },
    ),
  );

  assert.equal(observation.knownIdOutcome, "exact_reference", fixtureId);
  assert.equal(observation.knownIdRejectionSource, null, fixtureId);
  assert.equal(observation.semanticMatch, true, fixtureId);
  assert.equal(observation.usable, true, fixtureId);
  assert.deepEqual(observation.finalTaskIntents, ["schedule_plan"], fixtureId);
  assert.equal(
    observation.roleEvidence.fullOrchestrator
      .schedulePlanReferenceCorrectionCode,
    "provider_plan_id_rebound",
    fixtureId,
  );
  assertSafeKnownIdObservation(observation, fixtureId);
}
```

Extend `assertSafeKnownIdObservation()` so the serialized Full-role evidence
cannot contain the correction's internal task ID:

```ts
assert.equal(
  JSON.stringify(observation.roleEvidence).includes("\"taskId\""),
  false,
);
```

Do not reject the bounded code itself.

- [ ] **Step 2: Run the Known-ID evaluation tests**

Run:

```bash
env -u DATABASE_URL PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 AGENT_DISABLE_LLM=1 \
  node --import tsx --test \
  tests/agent/orchestration/l3b-production-gate-evaluation.test.ts
```

Expected after Task 2: PASS because `classifyKnownIdOutcome()` already reads
the normalized final intent. If this test fails, stop Task 3 and report the
unexpected classifier discrepancy for design review; do not broaden the
classifier ad hoc.

- [ ] **Step 3: Add the non-gating rebound metric**

Add to `ProductionGateProviderMetrics`:

```ts
providerPlanIdRebounds: number;
```

Populate it inside `computeProductionGateMetrics()`:

```ts
providerPlanIdRebounds: input.observations.filter(
  ({ roleEvidence }) =>
    roleEvidence.fullOrchestrator
      .schedulePlanReferenceCorrectionCode === "provider_plan_id_rebound",
).length,
```

Do not add this field to `ProductionGateFailureReason`,
`zeroToleranceReasons`, or `evaluateProductionGateThresholds()`.

- [ ] **Step 4: Add a metric test proving corrections are visible but non-gating**

In `knownIdObservations()`, set
`schedulePlanReferenceCorrectionCode: "provider_plan_id_rebound"` for the two
`accept_exact_reference` diagnostics and `null` for the four rejection
diagnostics. Add:

```ts
test("Known-ID passes exact references and typed safe rejections as diagnostic outcomes", () => {
  const summary = aggregateProductionGate({
    observations: knownIdObservations(),
    providerEvents: [],
    stage: "known_id",
  });

  assert.equal(summary.metrics.provider.providerPlanIdRebounds, 2);
  assert.equal(summary.failedGates.includes("semantic_match_rate"), false);
  assert.equal(summary.failedGates.includes("usable_result_rate"), false);
  assert.equal(summary.passed, true);
});
```

Add the correction assertion to the existing passing Known-ID metric test;
keep its `providerEvents: []` input and its existing `6/6` semantic and usable
assertions unchanged.

- [ ] **Step 5: Version the Known-ID report path to v4**

In `scripts/agent-production-seam-gate-eval.mjs`, change only:

```js
known_id: "/tmp/l3b-r8-production-known-id-v4.json",
```

Do not change stage cases, rounds, budgets, retry limits, Provider settings,
configuration hash inputs, or exclusive-create mode.

- [ ] **Step 6: Strengthen persisted-report retention enforcement**

Extend the report-key rejection expression in `assertReportSafe()` so
persisted JSON cannot contain a task ID:

```js
/"(?:cause|credentials|errorMessage|prompt|rawResponse|reasoning|response|stack|taskId)"\s*:/iu
```

The report may retain only the correction code and aggregate count. It must
not retain the internal correction object.

- [ ] **Step 7: Update the no-network preflight test for v4 and frozen older evidence**

In `l3b-production-gate-contract.test.ts`, use:

```ts
const reportPath = "/tmp/l3b-r8-production-known-id-v4.json";
const preservedReportPaths = [
  "/tmp/l3b-r8-production-known-id.json",
  "/tmp/l3b-r8-production-known-id-v2.json",
  "/tmp/l3b-r8-production-known-id-v3.json",
] as const;
```

Snapshot only existence, `mtimeMs`, `size`, and mode for every preserved path
before launching the preflight. Do not read their contents. After the child
process exits, assert all four paths have the same existence and metadata as
before. Retain these assertions:

```ts
assert.equal(preflight.observationCount, 6);
assert.deepEqual(
  preflight.fixtureIds,
  L3B_KNOWN_ID_DIAGNOSTICS.map(({ id }) => id),
);
assert.deepEqual(preflight.rounds, [1]);
assert.equal(preflight.reportPath, reportPath);
assert.equal(preflight.providerAttempts, 0);
assert.equal(preflight.budget.authorizedLogicalCallMaximum, 6);
assert.equal(preflight.budget.authorizedMaximum, 24);
assert.equal(preflight.budget.actualProviderAttempts, 0);
```

The test must continue to omit `DEEPSEEK_API_KEY`.

- [ ] **Step 8: Run Gate evaluation, metric, and contract tests**

Run:

```bash
env -u DATABASE_URL PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 AGENT_DISABLE_LLM=1 \
  node --import tsx --test \
  tests/agent/orchestration/l3b-production-gate-evaluation.test.ts \
  tests/agent/orchestration/l3b-production-gate-metrics.test.ts \
  tests/agent/orchestration/l3b-production-gate-contract.test.ts
```

Expected: all tests pass, the child preflight records zero Provider attempts,
and no report file is created or modified.

- [ ] **Step 9: Update the protected test map**

Update the `Production Seam Gate (L3-B / R8)` row in `tests/TEST_MAP.md` to
state:

- one trusted explicit authorized user plan ID is deterministically rebound
  into an accepted single-task `schedule_plan`;
- Provider ID copy drift is recorded only as
  `provider_plan_id_rebound`;
- invalid user references and title conflicts still clarify;
- the correction counter is observational and non-gating;
- Known-ID uses the exclusive v4 report path while v1/v2/v3 evidence is
  immutable;
- the one-round 6/24 budget and zero-call preflight remain frozen.

- [ ] **Step 10: Typecheck and lint the changed Gate surface**

Run:

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run typecheck
npx eslint \
  src/lib/agent/orchestration/schedule-plan-reference-contract.ts \
  src/lib/agent/orchestration/langchain-orchestrator.ts \
  src/lib/agent/orchestration/l3b-production-gate-model-adapters.ts \
  src/lib/agent/orchestration/l3b-production-gate.ts \
  scripts/agent-production-seam-gate-eval.mjs \
  tests/agent/orchestration/schedule-plan-reference-contract.test.ts \
  tests/agent/orchestration/schedule-plan-reference-clarification-projector.test.ts \
  tests/agent/orchestration/langchain-orchestrator.test.ts \
  tests/agent/orchestration/l3b-production-gate-evaluation.test.ts \
  tests/agent/orchestration/l3b-production-gate-metrics.test.ts \
  tests/agent/orchestration/l3b-production-gate-contract.test.ts
git diff --check
```

Expected: PASS.

- [ ] **Step 11: Commit Task 3**

```bash
git add \
  src/lib/agent/orchestration/l3b-production-gate.ts \
  scripts/agent-production-seam-gate-eval.mjs \
  tests/agent/orchestration/l3b-production-gate-evaluation.test.ts \
  tests/agent/orchestration/l3b-production-gate-metrics.test.ts \
  tests/agent/orchestration/l3b-production-gate-contract.test.ts \
  tests/TEST_MAP.md
git diff --cached --check
git commit -m "test(agent): prepare schedule binding known-id gate"
```

---

### Task 4: Full Deterministic Closure and Exact-HEAD Live Handoff

**Files:**
- Verify only: all files changed by Tasks 1-3
- Preserve metadata only:
  `/tmp/l3b-r8-production-known-id.json`,
  `/tmp/l3b-r8-production-known-id-v2.json`,
  `/tmp/l3b-r8-production-known-id-v3.json`
- Confirm absent and untouched:
  `/tmp/l3b-r8-production-known-id-v4.json`

**Interfaces:**
- Consumes the three independently committed implementation tasks.
- Produces a clean exact HEAD, deterministic verification evidence, and a
  zero-attempt preflight suitable for a new user disclosure approval.
- Does not produce a live Provider report or switch any runtime.

- [ ] **Step 1: Record final implementation scope**

Run:

```bash
git status --short --branch
git log --oneline -4
git diff b8d9f5c49ccfcbc11f629781a927d2cf8045570e..HEAD --stat
```

Expected: only the approved schedule binding, bounded evidence, Gate metric,
v4 harness path, tests, and test-map files changed after the design commit.

- [ ] **Step 2: Run the focused deterministic closure suite**

Run:

```bash
env -u DATABASE_URL PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 AGENT_DISABLE_LLM=1 \
  node --import tsx --test \
  tests/agent/orchestration/schedule-plan-reference-contract.test.ts \
  tests/agent/orchestration/schedule-plan-reference-clarification-projector.test.ts \
  tests/agent/orchestration/langchain-orchestrator.test.ts \
  tests/agent/orchestration/l3b-production-gate-evaluation.test.ts \
  tests/agent/orchestration/l3b-production-gate-metrics.test.ts \
  tests/agent/orchestration/l3b-production-gate-contract.test.ts
```

Expected: PASS with fake models, zero external Provider calls, zero database
connections, zero task execution, and zero business mutation.

- [ ] **Step 3: Run the deterministic repository baseline**

Run:

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run typecheck
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:agent
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:agent:planning
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:agent:schedule
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:content
npm run lint
npx eslint . --ignore-pattern '.claude/worktrees/**'
git diff --check
```

Expected: every command passes. If an unrelated environment failure occurs,
record the exact blocked command separately; do not label the implementation
complete until the relevant code tests, typecheck, lint, and whitespace checks
pass.

- [ ] **Step 4: Verify runtime and protocol defaults did not change**

Run:

```bash
git diff b8d9f5c49ccfcbc11f629781a927d2cf8045570e..HEAD -- \
  src/lib/agent/orchestration/orchestrator-runtime-config.ts \
  src/lib/agent/orchestration/orchestrator-intent-family-protocol.ts \
  src/lib/agent/llm/schemas/orchestrator-output.ts \
  src/lib/agent/orchestration/query-scope-contract.ts \
  src/lib/agent/orchestration/resource-readiness-guard.ts \
  src/lib/agent/orchestration/orchestrator-mapper.ts
```

Expected: no diff.

- [ ] **Step 5: Record report metadata without reading report contents**

Run:

```bash
for path in \
  /tmp/l3b-r8-production-known-id.json \
  /tmp/l3b-r8-production-known-id-v2.json \
  /tmp/l3b-r8-production-known-id-v3.json \
  /tmp/l3b-r8-production-known-id-v4.json
do
  if test -e "$path"; then
    stat -f '%N %z %m %Lp' "$path"
  else
    printf '%s ABSENT\n' "$path"
  fi
done
```

Expected: v1/v2/v3 metadata is available if those files exist; v4 is absent.
Do not open or parse any report.

- [ ] **Step 6: Ensure the implementation HEAD is committed and clean**

Run:

```bash
git status --short --branch
git rev-parse HEAD
```

Expected: no modified, staged, or untracked implementation files. Save the
exact HEAD value for the preflight and later disclosure request.

- [ ] **Step 7: Run the no-network Known-ID v4 preflight**

Capture the exact HEAD from Step 6 and use the unchanged evaluation
configuration hash:

```bash
L3B_ACCEPTED_HEAD="$(git rev-parse HEAD)"
env -u DATABASE_URL -u DEEPSEEK_API_KEY \
  AGENT_PRODUCTION_SEAM_EVAL=1 \
  AGENT_LIVE_LLM_EVAL=1 \
  L3B_PRODUCTION_PROVIDER_DATA_APPROVED=1 \
  L3B_PRODUCTION_GATE_PREFLIGHT_ONLY=1 \
  L3B_PRODUCTION_GATE_STAGE=known_id \
  L3B_PRODUCTION_GATE_ACCEPTED_HEAD="$L3B_ACCEPTED_HEAD" \
  L3B_PRODUCTION_GATE_ACCEPTED_CONFIG_HASH='e8b1bc6ca6580f446b3d8cdaa886c5143f72dc17067cf9733ca702e19121f108' \
  PAYLOAD_SECRET='sunnypanel-agent-test-secret-2026' \
  node --import tsx scripts/agent-production-seam-gate-eval.mjs
```

Expected preflight facts:

```text
stage: known_id
observationCount: 6
rounds: [1]
authorizedLogicalCallMaximum: 6
authorizedMaximum: 24
providerAttempts: 0
reportPath: /tmp/l3b-r8-production-known-id-v4.json
status: ready
```

No Provider key is present, no Provider request is made, and v4 remains absent.

- [ ] **Step 8: Recheck evidence metadata and clean state**

Repeat Steps 5 and 6.

Expected: v1/v2/v3 metadata is unchanged, v4 remains absent, and the worktree
remains clean.

- [ ] **Step 9: Stop and request separate live authorization**

Report:

- exact final HEAD;
- commits from Tasks 1-3;
- focused and full deterministic test results;
- no-network preflight facts;
- v1/v2/v3 metadata preservation;
- v4 absence;
- implementation Provider attempts `0`;
- Legacy remains default and LangChain adoption remains blocked.

Then request explicit approval for exactly:

```text
6 Known-ID synthetic messages
synthetic workspace contexts
actor-authorized resource projection
Full Orchestrator system rules
strict Orchestrator schema
6 observations
at most 6 logical calls
at most 24 Provider attempts
exclusive report /tmp/l3b-r8-production-known-id-v4.json
```

Do not run the live Gate in the same implementation turn.
