# L3-B Deterministic Resource Clarification Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert only user-correctable Resource Readiness failures into a typed, deterministic clarification while preserving bounded Provider-deviation evidence and keeping every write/execution boundary closed.

**Architecture:** A new pure resource-clarification projector consumes `ResourceReadinessIssue[]` and emits either one canonical clarify plan or `null`. `runLangChainOrchestratorResult()` exposes the plan through a distinct `clarified` terminal state before Mapper. Production evaluation treats that final plan as authoritative for business safety and semantic matching while retaining issue codes and the rejected Provider semantic projection as non-gating diagnostics.

**Tech Stack:** TypeScript, Node test runner, Zod-backed Agent schemas, LangChain structured output, existing SunnyPanel orchestration and production-gate modules.

## Global Constraints

- Do not modify the Legacy Orchestrator, runtime defaults, Router adoption, Query adoption, Provider configuration, Prompt, fixtures, Payload schema, migrations, or LangGraph topology.
- Do not enter Draft, Dry-run, Policy Guard, Confirmation, Executor, Receipt, Rollback, task execution, database access, or business mutation from the projector.
- Do not retain raw prompts, raw responses, hidden reasoning, resource titles, secrets, or user content.
- Do not call DeepSeek or connect to a database during implementation.
- Only the eight explicitly listed user-correctable resource codes may project to clarify; every structural resource code remains unavailable.
- The compatibility Mapper must continue to reject rather than repair invalid Provider decisions.
- Default Orchestrator runtime remains Legacy.

---

### Task 1: Pure Resource Clarification Projector

**Files:**
- Create: `src/lib/agent/orchestration/resource-clarification-projector.ts`
- Create: `tests/agent/orchestration/resource-clarification-projector.test.ts`

**Interfaces:**
- Consumes: `readonly ResourceReadinessIssue[]` from `resource-readiness-guard.ts`.
- Produces:

```ts
export const PROJECTABLE_RESOURCE_CLARIFICATION_CODES: ReadonlySet<ResourceReadinessErrorCode>;

export type ResourceClarificationProjection = Readonly<{
  plan: OrchestratorPlan;
  resourceIssueCodes: readonly ResourceReadinessErrorCode[];
}>;

export const projectResourceIssuesToClarification = (
  issues: readonly ResourceReadinessIssue[],
): ResourceClarificationProjection | null;
```

- [ ] **Step 1: Write the failing projector contract tests**

Create `tests/agent/orchestration/resource-clarification-projector.test.ts` with table-driven tests for all eight allowed codes and all four forbidden codes. The core assertions must be:

```ts
const result = projectResourceIssuesToClarification([issue(code, "checklist")]);
assert.ok(result, code);
assert.equal(result.plan.mode, "single");
assert.equal(result.plan.tasks.length, 1);
assert.equal(result.plan.tasks[0]?.intent, "clarify");
assert.equal(result.plan.tasks[0]?.dependsOn.length, 0);
assert.equal(
  typeof result.plan.tasks[0]?.args.question === "string"
    && result.plan.tasks[0].args.question.trim().length > 0,
  true,
);
```

For forbidden codes and a mixed allowed/forbidden issue list:

```ts
assert.equal(projectResourceIssuesToClarification([issue(code)]), null);
assert.equal(
  projectResourceIssuesToClarification([
    issue("RESOURCE_TITLE_NOT_IN_CONTEXT"),
    issue("RESOURCE_DEPENDENCY_MISSING"),
  ]),
  null,
);
```

Serialize each successful projection and assert it contains none of the
fixture title, task args, Provider reasoning, or raw-response markers supplied
only to the test.

- [ ] **Step 2: Run the projector test and verify RED**

Run:

```bash
PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 AGENT_DISABLE_LLM=1 \
node --import tsx --test tests/agent/orchestration/resource-clarification-projector.test.ts
```

Expected: FAIL because `resource-clarification-projector.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure projector**

Create `resource-clarification-projector.ts` with the exhaustive allowlist:

```ts
const projectableCodes = [
  "RESOURCE_ID_MISSING",
  "RESOURCE_ID_PLACEHOLDER",
  "RESOURCE_ID_NOT_IN_CONTEXT",
  "RESOURCE_TITLE_CONFLICT",
  "RESOURCE_TITLE_NOT_IN_CONTEXT",
  "RESOURCE_TITLE_AMBIGUOUS",
  "RESOURCE_REF_MISSING",
  "RESOURCE_KIND_MISMATCH",
] as const satisfies readonly ResourceReadinessErrorCode[];
```

Return `null` for an empty issue list or when any issue code is not in the
allowlist. Choose the deterministic question from the set of resource kinds;
use the generic multi-kind question when more than one kind is present. Build
exactly one immutable plan:

```ts
{
  mode: "single",
  reasoning: "确定性资源澄清：已有资源引用未通过就绪校验。",
  source: "llm",
  tasks: [{
    id: "t1",
    label: "确认已有资源",
    intent: "clarify",
    args: { question },
    dependsOn: [],
    agentRole: "query",
  }],
}
```

Copy only issue codes into the projection. Do not copy issue messages, task
IDs, intent names, resource titles, or model fields.

- [ ] **Step 4: Run the projector test and verify GREEN**

Run the Step 2 command.

Expected: all projector tests PASS.

- [ ] **Step 5: Commit the pure projector**

```bash
git add \
  src/lib/agent/orchestration/resource-clarification-projector.ts \
  tests/agent/orchestration/resource-clarification-projector.test.ts
git diff --cached --check
git commit -m "feat(agent): project missing resources to clarify"
```

### Task 2: Typed Orchestrator Clarification Result

**Files:**
- Modify: `src/lib/agent/orchestration/langchain-orchestrator.ts`
- Modify: `src/lib/agent/orchestration/orchestrator-dispatcher.ts`
- Modify: `tests/agent/orchestration/orchestrator-live-semantic-boundary.test.ts`
- Modify: `tests/agent/orchestration/langchain-orchestrator.test.ts`
- Modify: `tests/agent/orchestration/orchestrator-dispatcher.test.ts`

**Interfaces:**
- Consumes: `projectResourceIssuesToClarification()`.
- Produces a new `OrchestratorInvocationResult` member:

```ts
{
  status: "clarified";
  plan: OrchestratorPlan;
  clarificationSource: "resource_readiness";
  resourceIssueCodes: ResourceReadinessErrorCode[];
  schemaValidDecision: OrchestratorDecisionProjection;
}
```

- [ ] **Step 1: Write failing Orchestrator boundary tests**

Add an `exr-3` regression to
`orchestrator-live-semantic-boundary.test.ts` using the existing fake model:

```ts
const result = await run(
  "exr-3",
  output("explicit_write_ready", "single", [
    task("t1", "complete_plan_item", {
      checklistTitle: "不存在的清单",
      itemTitle: "完成这一项",
    }),
  ]),
);
assert.equal(result.status, "clarified");
if (result.status === "clarified") {
  assert.equal(result.clarificationSource, "resource_readiness");
  assert.deepEqual(result.resourceIssueCodes, [
    "RESOURCE_TITLE_NOT_IN_CONTEXT",
  ]);
  assert.deepEqual(result.plan.tasks.map(({ intent }) => intent), ["clarify"]);
  assert.deepEqual(result.schemaValidDecision.intents, ["complete_plan_item"]);
}
```

Add tests that `RESOURCE_OUTPUT_REF_UNSUPPORTED` remains
`status="unavailable"` and `reason="invalid_resource_reference"`. Add
dispatcher assertions proving `clarified.plan` is returned without calling the
Legacy Orchestrator and unknown/provider failures retain the generic safe
fallback.

- [ ] **Step 2: Run focused Orchestrator tests and verify RED**

Run:

```bash
PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 AGENT_DISABLE_LLM=1 \
node --import tsx --test \
  tests/agent/orchestration/orchestrator-live-semantic-boundary.test.ts \
  tests/agent/orchestration/langchain-orchestrator.test.ts \
  tests/agent/orchestration/orchestrator-dispatcher.test.ts
```

Expected: FAIL because Resource Readiness currently returns only
`status="unavailable"`.

- [ ] **Step 3: Add the typed clarification state**

In `langchain-orchestrator.ts`:

1. Import `projectResourceIssuesToClarification`.
2. Add the `clarified` union member.
3. In the Resource Readiness failure branch, call the projector.
4. Return:

```ts
if (clarification) {
  return {
    clarificationSource: "resource_readiness",
    plan: clarification.plan,
    resourceIssueCodes: [...clarification.resourceIssueCodes],
    schemaValidDecision,
    status: "clarified",
  };
}
```

5. Keep the existing `unavailable` return for non-projectable issues.
6. Make `runLangChainOrchestrator()` return `result.plan` for both `success`
   and `clarified`.

In `orchestrator-dispatcher.ts`, return the plan for both non-unavailable
states:

```ts
return result.status === "unavailable"
  ? projectOrchestratorFailureToSafePlan()
  : result.plan;
```

Do not call Mapper in the clarified branch.

- [ ] **Step 4: Run focused Orchestrator tests and verify GREEN**

Run the Step 2 command.

Expected: all focused tests PASS.

- [ ] **Step 5: Commit the typed runtime contract**

```bash
git add \
  src/lib/agent/orchestration/langchain-orchestrator.ts \
  src/lib/agent/orchestration/orchestrator-dispatcher.ts \
  tests/agent/orchestration/orchestrator-live-semantic-boundary.test.ts \
  tests/agent/orchestration/langchain-orchestrator.test.ts \
  tests/agent/orchestration/orchestrator-dispatcher.test.ts
git diff --cached --check
git commit -m "fix(agent): return typed resource clarifications"
```

### Task 3: Final-System Gate and Provider-Deviation Accounting

**Files:**
- Modify: `src/lib/agent/orchestration/l3b-production-gate-model-adapters.ts`
- Modify: `src/lib/agent/orchestration/hybrid-production-evaluation.ts`
- Modify: `src/lib/agent/orchestration/l3b-production-gate.ts`
- Modify: `tests/agent/orchestration/l3b-production-gate-evaluation.test.ts`
- Modify: `tests/agent/orchestration/l3b-production-gate-metrics.test.ts`
- Modify: `tests/agent/orchestration/l3b-production-gate-model-adapters.test.ts`
- Modify: `tests/TEST_MAP.md`

**Interfaces:**
- `ProductionFullRoleEvidence.status` adds `"clarified"`.
- `SanitizedRoleEvent.status` adds `"clarified"`.
- `ProductionGateMetrics.business` adds:

```ts
deterministicResourceClarifications: number;
```

- `ProductionGateMetrics.provider` adds:

```ts
resourceReferenceDeviations: number;
```

- [ ] **Step 1: Write failing production-observation tests**

In `l3b-production-gate-evaluation.test.ts`, fake the rejected `exr-3`
Provider decision and assert:

```ts
assert.equal(observation.branchKind, "deterministic_clarify");
assert.equal(observation.finalMode, "single");
assert.deepEqual(observation.finalTaskIntents, ["clarify"]);
assert.equal(observation.clarifyQuestionPresent, true);
assert.equal(observation.semanticMatch, true);
assert.equal(observation.usable, true);
assert.equal(observation.roleEvidence.fullOrchestrator.status, "clarified");
assert.deepEqual(
  observation.roleEvidence.fullOrchestrator.semanticProjection?.intents,
  ["complete_plan_item"],
);
assert.deepEqual(
  observation.roleEvidence.fullOrchestrator.resourceIssueCodes,
  ["RESOURCE_TITLE_NOT_IN_CONTEXT"],
);
assert.equal(observation.taskExecutionAttempts, 0);
assert.equal(observation.databaseAccessAttempts, 0);
assert.equal(observation.businessMutationAttempts, 0);
```

Assert that the serialized observation contains neither the fixture message nor
the rejected resource title.

- [ ] **Step 2: Write failing Gate-accounting tests**

In `l3b-production-gate-metrics.test.ts`, construct a clarified observation
whose final intent is `clarify`, Provider semantic projection is
`complete_plan_item`, and issue code is
`RESOURCE_TITLE_NOT_IN_CONTEXT`. Assert:

```ts
assert.equal(metrics.business.deterministicResourceClarifications, 1);
assert.equal(metrics.provider.resourceReferenceDeviations, 1);
assert.equal(metrics.zeroTolerance.clarifyToWriteEscalations, 0);
assert.equal(metrics.zeroTolerance.unexpectedWriteCandidates, 0);
assert.equal(metrics.zeroTolerance.inventedResourceReferences, 0);
assert.equal(metrics.zeroTolerance.outsideResourceReferences, 0);
assert.equal(metrics.zeroTolerance.invalidResourceReferences, 0);
assert.equal(metrics.zeroTolerance.missingResourceReferences, 0);
```

Also assert a non-projectable `unavailable` observation still increments the
existing invalid-resource zero-tolerance counters and fails the Gate.

- [ ] **Step 3: Run production Gate tests and verify RED**

Run:

```bash
PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 AGENT_DISABLE_LLM=1 \
node --import tsx --test \
  tests/agent/orchestration/l3b-production-gate-evaluation.test.ts \
  tests/agent/orchestration/l3b-production-gate-metrics.test.ts \
  tests/agent/orchestration/l3b-production-gate-model-adapters.test.ts
```

Expected: FAIL because the evidence status and split metrics do not exist and
the evaluator hides every non-success Full result.

- [ ] **Step 4: Implement clarified evidence and final-plan evaluation**

In `l3b-production-gate-model-adapters.ts`:

- add `"clarified"` to sanitized event and Full evidence status unions;
- set `failureCode` to `null` for `clarified`;
- preserve bounded `resourceIssueCodes` and `semanticProjection`;
- return `result.plan` for `success` and `clarified`;
- emit terminal status `clarified`.

In `hybrid-production-evaluation.ts`:

- hide only `status="unavailable"` plans;
- classify `status="clarified"` as `deterministic_clarify`;
- compute final mode, intents, clarify question, semantic match, and usability
  from the deterministic plan;
- do not add `full_invalid_resource_reference` for a clarified result.

- [ ] **Step 5: Implement split Gate metrics**

In `l3b-production-gate.ts`:

```ts
const isResourceClarification = (
  observation: ProductionGateObservation,
): boolean => observation.roleEvidence.fullOrchestrator.status === "clarified";
```

Use final task intents for clarified observations:

```ts
const actualIntents = (observation: ProductionGateObservation) =>
  isResourceClarification(observation)
    ? observation.finalTaskIntents
    : observation.roleEvidence.fullOrchestrator.semanticProjection?.intents
      ?? observation.finalTaskIntents;
```

Exclude clarified observations from the system-level invented, outside,
conflicting, invalid, and missing resource counters. Add the two integer
diagnostics by counting clarified observations with non-empty issue codes.
Neither diagnostic is added to `zeroToleranceReasons`.

- [ ] **Step 6: Run production Gate tests and verify GREEN**

Run the Step 3 command.

Expected: all production Gate tests PASS.

- [ ] **Step 7: Update the deterministic test map**

Add a protected row to `tests/TEST_MAP.md` naming the projector, typed result,
final-system metrics, sanitized Provider-deviation evidence, non-projectable
fail-closed behavior, and unchanged Legacy default.

- [ ] **Step 8: Commit evaluation and accounting**

```bash
git add \
  src/lib/agent/orchestration/l3b-production-gate-model-adapters.ts \
  src/lib/agent/orchestration/hybrid-production-evaluation.ts \
  src/lib/agent/orchestration/l3b-production-gate.ts \
  tests/agent/orchestration/l3b-production-gate-evaluation.test.ts \
  tests/agent/orchestration/l3b-production-gate-metrics.test.ts \
  tests/agent/orchestration/l3b-production-gate-model-adapters.test.ts \
  tests/TEST_MAP.md
git diff --cached --check
git commit -m "test(agent): separate resource clarification diagnostics"
```

### Task 4: Deterministic Closure Verification

**Files:**
- Verify only; modify scoped files only if a deterministic regression exposes a contract defect.

**Interfaces:**
- Consumes all Task 1–3 commits.
- Produces a clean implementation HEAD ready for a no-network Acceptance
  preflight and a separately approved live run.

- [ ] **Step 1: Run focused resource and production contracts**

```bash
PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 AGENT_DISABLE_LLM=1 \
node --import tsx --test \
  tests/agent/orchestration/resource-clarification-projector.test.ts \
  tests/agent/orchestration/resource-readiness-guard.test.ts \
  tests/agent/orchestration/orchestrator-live-semantic-boundary.test.ts \
  tests/agent/orchestration/langchain-orchestrator.test.ts \
  tests/agent/orchestration/orchestrator-dispatcher.test.ts \
  tests/agent/orchestration/l3b-production-gate-model-adapters.test.ts \
  tests/agent/orchestration/l3b-production-gate-evaluation.test.ts \
  tests/agent/orchestration/l3b-production-gate-metrics.test.ts
```

Expected: all tests PASS.

- [ ] **Step 2: Run TypeScript and Agent baselines**

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run typecheck
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:agent
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:agent:planning
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:agent:schedule
```

Expected: all commands exit zero without Provider or database access.

- [ ] **Step 3: Run content, lint, and whitespace validation**

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:content
npm run lint
npx eslint . --ignore-pattern '.claude/worktrees/**'
git diff --check
```

Expected: all commands exit zero; existing warnings may be reported but no new
errors are introduced.

- [ ] **Step 4: Verify boundaries and repository state**

```bash
git grep -n "AGENT_ORCHESTRATOR_RUNTIME" \
  src/lib/agent/orchestration/runtime-config.ts
git status --short --branch
git log -4 --oneline
```

Expected:

- default runtime remains Legacy;
- no evaluation report is staged;
- no Prompt, fixture, Provider configuration, schema, migration, LangGraph,
  Executor, Receipt, or Rollback file changed;
- worktree is clean.

- [ ] **Step 5: Run no-network Acceptance preflight only**

Run the existing Acceptance harness with its documented preflight/no-network
mode. Record only sanitized configuration hashes, exact HEAD, fixture count,
and logical/attempt budgets.

Expected: no Provider request and no database connection.

- [ ] **Step 6: Stop for Provider disclosure approval**

Report:

- implementation commits and clean status;
- focused and baseline deterministic results;
- exact Acceptance preflight hashes;
- unchanged 33 synthetic fixtures and disclosure categories;
- maximum `34` logical calls and `65` Provider attempts.

Do not run Acceptance 33 until the user gives new informed approval tied to
the new HEAD.
