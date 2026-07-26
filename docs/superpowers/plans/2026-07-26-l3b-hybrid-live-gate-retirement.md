# L3-B Hybrid Live Gate Retirement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire the obsolete one-time Hybrid focused Provider entry while preserving the active Hybrid product path and making Production Seam `focused` the only executable L3-B live gate.

**Architecture:** Keep the historical script path as a fail-closed compatibility tombstone. The old preflight assertion becomes an unconditional typed retirement boundary, so the old runner cannot invoke an evaluation callback. Product Hybrid evaluation remains unchanged; the Production Seam manifest and stage contracts remain the only live authorization path.

**Tech Stack:** TypeScript, Node.js ESM, Node test runner, `tsx`, existing L3-B Production Seam Gate contracts.

## Global Constraints

- No Provider call, database connection, task execution, or business mutation.
- Do not change Prompt, schema, fixtures, retry, timeout, thresholds, model configuration, or Production Seam stage sizes.
- Do not refresh `HYBRID_FOCUSED_GATE_FROZEN_HASHES`.
- Do not change the default Orchestrator runtime or enable LangChain adoption.
- Do not delete Legacy Router, Legacy Orchestrator, compatibility facades, or business execution paths.
- The retired entry must not redirect automatically to the Production Seam Gate.
- The replacement live path is `scripts/agent-production-seam-gate-eval.mjs` with stage `focused` and an exact accepted disclosure manifest.

---

### Task 1: Retire the Old Executable Script

**Files:**
- Modify: `scripts/agent-hybrid-query-boundary-eval.mjs`
- Modify: `tests/agent/orchestration/hybrid-live-harness-contract.test.ts`
- Modify: `tests/agent/orchestration/hybrid-evaluation-harness.test.ts`

**Interfaces:**
- Consumes: the historical script pathname used by operators and tests.
- Produces: one sanitized, non-zero terminal result with `errorCode="HYBRID_FOCUSED_GATE_RETIRED"`, `providerAttempts=0`, and `replacement="production_seam_focused"`.

- [ ] **Step 1: Replace the old approval test with a failing retirement behavior test**

In `hybrid-live-harness-contract.test.ts`, make the child process run with no
approval flags or API key and assert the exact terminal object:

```ts
test("the obsolete Hybrid script retires before approval or Provider setup", () => {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/agent-hybrid-query-boundary-eval.mjs"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        DATABASE_URL: "must-not-be-read",
        DEEPSEEK_API_KEY: "must-not-be-read",
        NODE_ENV: "test",
        PATH: process.env.PATH ?? "",
      },
    },
  );

  assert.equal(result.status, 1);
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout.trim()), {
    errorCode: "HYBRID_FOCUSED_GATE_RETIRED",
    passed: false,
    providerAttempts: 0,
    replacement: "production_seam_focused",
  });
});
```

Delete the former source-order/live-readiness test. Remove the obsolete
“R4 live harness imports the production evaluator” test from
`hybrid-evaluation-harness.test.ts` and remove its now-unused `existsSync`
import; the remaining tests continue to cover the active production evaluator
directly.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG \
  PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 \
  AGENT_DISABLE_LLM=1 \
  node --import tsx --test \
  tests/agent/orchestration/hybrid-live-harness-contract.test.ts \
  tests/agent/orchestration/hybrid-evaluation-harness.test.ts
```

Expected: the new retirement test fails because the script still reports a
missing opt-in flag.

- [ ] **Step 3: Replace the old script with the minimal tombstone**

The complete script becomes:

```js
#!/usr/bin/env node

/**
 * Retired one-time R4 Hybrid focused Provider gate.
 *
 * The Production Seam focused stage is the only executable replacement.
 */

process.stdout.write(`${JSON.stringify({
  errorCode: "HYBRID_FOCUSED_GATE_RETIRED",
  passed: false,
  providerAttempts: 0,
  replacement: "production_seam_focused",
})}\n`);
process.exitCode = 1;
```

It has no imports and reads no environment variable.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run the Step 2 command.

Expected: all tests pass; the child exits `1`, emits the exact sanitized
retirement object, and performs zero Provider attempts.

- [ ] **Step 5: Commit Task 1**

```bash
git add \
  scripts/agent-hybrid-query-boundary-eval.mjs \
  tests/agent/orchestration/hybrid-live-harness-contract.test.ts \
  tests/agent/orchestration/hybrid-evaluation-harness.test.ts
git diff --cached --check
git commit -m "chore(agent): retire obsolete hybrid live gate"
```

---

### Task 2: Make Historical Preflight and Runner Fail Closed

**Files:**
- Modify: `src/lib/agent/orchestration/hybrid-focused-gate-preflight.ts`
- Modify: `tests/agent/orchestration/fixtures/hybrid-focused-gate-contract.ts`
- Modify: `tests/agent/orchestration/hybrid-gate-preflight.test.ts`
- Modify: `tests/agent/orchestration/hybrid-gate-runner.test.ts`

**Interfaces:**
- Consumes: `assertHybridFocusedGatePreflight(preflight)` and
  `runHybridFocusedGate({ evaluate, preflight })`.
- Produces: typed `HYBRID_FOCUSED_GATE_RETIRED` failure before hash comparison
  or evaluation callback.

- [ ] **Step 1: Write the typed retirement RED tests**

Add `HYBRID_FOCUSED_GATE_RETIRED` to the test fixture error-code union.

Replace the preflight “current frozen hashes pass” assertion with:

```ts
test("the historical Hybrid preflight always fails typed and retired", async () => {
  const {
    assertHybridFocusedGatePreflight,
    buildHybridFocusedGatePreflight,
  } = await loadPreflight();
  const preflight = buildHybridFocusedGatePreflight({ head: "historical" });

  assert.throws(
    () => assertHybridFocusedGatePreflight(preflight),
    (error: unknown) =>
      typeof error === "object"
      && error !== null
      && "code" in error
      && error.code === "HYBRID_FOCUSED_GATE_RETIRED"
      && !("cause" in error),
  );
});
```

Replace the active runner tests with one zero-callback contract:

```ts
test("the retired Hybrid runner invokes zero evaluation callbacks", async () => {
  const { runHybridFocusedGate } =
    await loadR4AGreenModule<FocusedGateRunnerModule>(
      R4A_GREEN_MODULES.focusedGateRunner,
      "hybrid_focused_gate_retired",
    );
  let callbacks = 0;

  await assert.rejects(
    runHybridFocusedGate({
      evaluate: async () => {
        callbacks += 1;
        return baseObservation();
      },
      preflight: await loadPreflight(),
    }),
    (error: unknown) =>
      typeof error === "object"
      && error !== null
      && "code" in error
      && error.code === "HYBRID_FOCUSED_GATE_RETIRED",
  );
  assert.equal(callbacks, 0);
});
```

Delete the former 12-observation active-run and transport-denominator tests.
Keep independent observation classification, accounting, and report-retention
tests in their existing files.

- [ ] **Step 2: Run the preflight and runner tests and verify RED**

Run:

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG \
  PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 \
  AGENT_DISABLE_LLM=1 \
  node --import tsx --test \
  tests/agent/orchestration/hybrid-gate-preflight.test.ts \
  tests/agent/orchestration/hybrid-gate-runner.test.ts
```

Expected: the retirement expectations fail with the current
`RESIDUAL_PROMPT_HASH_MISMATCH`.

- [ ] **Step 3: Add the typed retirement boundary**

Extend `HybridFocusedGatePreflightErrorCode`:

```ts
export type HybridFocusedGatePreflightErrorCode =
  | "HYBRID_FOCUSED_GATE_RETIRED"
  | "CMP4_RESIDUAL_INPUT_INVALID"
  | "EVALUATION_CONFIG_HASH_MISMATCH"
  | "EVALUATION_CONFIG_INVALID"
  | "FIXTURE_SNAPSHOT_HASH_MISMATCH"
  | "FOCUSED_FIXTURE_SET_INVALID"
  | "OBSERVATION_CONTRACT_MISMATCH"
  | "QUERY_COMMENTARY_MODE_MISMATCH"
  | "RESIDUAL_BUDGET_CONFIG_MISMATCH"
  | "RESIDUAL_PROMPT_HASH_MISMATCH"
  | "RESIDUAL_SCHEMA_HASH_MISMATCH";
```

Replace the body of `assertHybridFocusedGatePreflight`:

```ts
export const assertHybridFocusedGatePreflight = (
  _preflight: HybridFocusedGatePreflight,
): never => {
  throw new HybridFocusedGatePreflightError(
    "HYBRID_FOCUSED_GATE_RETIRED",
  );
};
```

Keep `HYBRID_FOCUSED_GATE_FROZEN_HASHES` unchanged as historical evidence.
Do not modify `runHybridFocusedGate`; its existing first operation calls the
assertion before initializing observations or invoking `evaluate`.

- [ ] **Step 4: Run the focused retirement and reusable Hybrid tests**

Run:

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG \
  PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 \
  AGENT_DISABLE_LLM=1 \
  node --import tsx --test \
  tests/agent/orchestration/hybrid-gate-preflight.test.ts \
  tests/agent/orchestration/hybrid-gate-runner.test.ts \
  tests/agent/orchestration/hybrid-observation-classification.test.ts \
  tests/agent/orchestration/hybrid-observation-contract.test.ts \
  tests/agent/orchestration/hybrid-gate-budget.test.ts \
  tests/agent/orchestration/hybrid-report-retention.test.ts
```

Expected: all tests pass with zero Provider/database activity.

- [ ] **Step 5: Commit Task 2**

```bash
git add \
  src/lib/agent/orchestration/hybrid-focused-gate-preflight.ts \
  tests/agent/orchestration/fixtures/hybrid-focused-gate-contract.ts \
  tests/agent/orchestration/hybrid-gate-preflight.test.ts \
  tests/agent/orchestration/hybrid-gate-runner.test.ts
git diff --cached --check
git commit -m "test(agent): close retired hybrid gate contracts"
```

---

### Task 3: Canonical Replacement Metadata and Deterministic Closure

**Files:**
- Modify: `tests/TEST_MAP.md`
- Verify: `src/lib/agent/orchestration/l3b-production-gate-contract.ts`
- Verify: `src/lib/agent/orchestration/l3b-production-gate-manifest.ts`
- Verify: `scripts/agent-production-seam-gate-eval.mjs`
- Test: `tests/agent/orchestration/l3b-production-gate-contract.test.ts`
- Test: all Task 1 and Task 2 tests.

**Interfaces:**
- Consumes: the current Production Seam `focused` contract.
- Produces: documentation and verification proving it is the only executable
  live replacement.

- [ ] **Step 1: Update the protected test map**

Change the Hybrid Query Boundary row so its representative files contain only
product/deterministic code and no longer list the retired script.

Change Hybrid Gate Readiness and Hybrid Live Harness Closure to state:

```text
The historical one-time Hybrid Provider script is a typed fail-closed
compatibility tombstone and cannot load a model or invoke an evaluation
callback. Reusable observation, accounting, candidate, and retention contracts
remain protected. The Production Seam focused stage is the sole executable live
replacement and requires an exact disclosure manifest before model imports.
```

Do not rewrite historical design records.

- [ ] **Step 2: Verify the canonical Production Seam replacement**

Run:

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG \
  PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 \
  AGENT_DISABLE_LLM=1 \
  node --import tsx --test \
  tests/agent/orchestration/l3b-production-gate-contract.test.ts \
  tests/agent/orchestration/l3b-production-gate-evaluation.test.ts \
  tests/agent/orchestration/l3b-production-gate-metrics.test.ts
```

Expected: all tests pass; focused remains exactly 15 ordered observations and
manifest mismatch remains zero-attempt fail-closed.

- [ ] **Step 3: Run the full deterministic baseline**

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

Run `hybrid-observation-contract.test.ts` in its own process rather than a
single all-orchestration glob, because unrelated test files mutate process-wide
environment variables.

- [ ] **Step 4: Verify defaults and no live side effects**

Run the retired script without an API key and verify:

```text
errorCode = HYBRID_FOCUSED_GATE_RETIRED
providerAttempts = 0
replacement = production_seam_focused
```

Run the Production Seam focused preflight without an API key. Record only
sanitized hashes and numeric budgets; do not set a live accepted manifest and
do not create a report. Verify default Orchestrator runtime remains `legacy`.

```bash
HEAD_SHA="$(git rev-parse HEAD)"
CONFIG_HASH="$(
  node --import tsx -e \
  'import { L3B_EVALUATION_CONFIG_HASH } from "./src/lib/agent/orchestration/l3b-evaluation-config.ts"; process.stdout.write(L3B_EVALUATION_CONFIG_HASH);'
)"
env -u DATABASE_URL -u DEEPSEEK_API_KEY \
  PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 \
  L3B_PRODUCTION_PROVIDER_DATA_APPROVED=1 \
  L3B_PRODUCTION_GATE_STAGE=focused \
  L3B_PRODUCTION_GATE_ACCEPTED_HEAD="$HEAD_SHA" \
  L3B_PRODUCTION_GATE_ACCEPTED_CONFIG_HASH="$CONFIG_HASH" \
  L3B_PRODUCTION_GATE_PREFLIGHT_ONLY=1 \
  node --import tsx scripts/agent-production-seam-gate-eval.mjs
```

Expected: `preflight.status="ready"`, `providerAttempts=0`, and no report file.

- [ ] **Step 5: Commit Task 3**

```bash
git add tests/TEST_MAP.md
git diff --cached --check
git commit -m "docs(agent): mark hybrid gate superseded"
```

- [ ] **Step 6: Final review and handoff**

Review the complete retirement diff from the design commit through Task 3.
Confirm:

- old script cannot read secrets or import Provider-capable code;
- old runner cannot invoke callbacks;
- current Product Hybrid path is untouched;
- Production Seam manifests and stage sizes are unchanged;
- no Prompt/schema/fixture/hash was refreshed;
- standard deterministic suites pass;
- worktree is clean.

After review, generate fresh no-network Production Seam manifest hashes for
`focused`, `acceptance`, `known_id`, and `stability` on the final HEAD. Stop
before all live Provider requests and request exact stage-specific disclosure
approval.
