# L3-B Full Orchestrator Bounded Timeout Retry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one Full-Orchestrator-only 10-second recovery attempt after the existing 30-second timeout without changing logical-call ownership, other model callers, or Legacy defaults.

**Architecture:** Extend the shared structured invocation with a default-off timeout policy and make its recovery attempt terminal after one request. Thread that policy only through the Full Orchestrator and Production Seam Gate, then update evidence-based attempt ceilings and hash-bound disclosure metadata.

**Tech Stack:** TypeScript, Node.js ESM, Node test runner, LangChain chat-model abstraction, Zod, existing L3-B Production Seam Gate.

## Global Constraints

- First Full Orchestrator attempt remains exactly `30_000` ms.
- One timeout recovery attempt is allowed for exactly `10_000` ms.
- Total logical-call timeout budget is at most `40_000` ms.
- The timeout policy is opt-in and Full-Orchestrator-only.
- Caller abort never retries.
- The recovery attempt cannot schedule schema, transport, or timeout retries.
- No Provider call, database connection, task execution, or business mutation.
- Do not change Prompt, schema, fixtures, thresholds, model, Provider SDK, or default runtime.
- Do not enable LangChain adoption or delete Legacy paths.
- New live manifests require separate approval after the final clean commit.

---

### Task 1: Lock the Shared Timeout-Recovery Primitive

**Files:**
- Modify: `tests/agent/llm/invoke-structured.test.ts`
- Modify: `src/lib/agent/llm/invoke-structured.ts`

**Interfaces:**
- Consumes: existing `InvokeStructuredOptions`, `StructuredProviderAttemptEvent`, and Provider attempt authorization.
- Produces: optional `timeoutRetryPolicy: { maxRetries: number; retryTimeoutMs: number }`, defaulting to no timeout retry.

- [ ] **Step 1: Add RED tests for opt-in recovery and default preservation**

Add deterministic fake-model tests which assert:

```ts
assert.equal(defaultTimeoutCallCount, 1);
assert.equal(recoveredCallCount, 2);
assert.deepEqual(timeoutFailures, [{
  attempt: 1,
  reason: "timeout",
  retryScheduled: true,
}]);
```

The recovery test returns a valid strict-schema object on attempt two. A
separate test returns an invalid schema on the recovery attempt and asserts
that no third Provider request occurs even when schema and transport retry
budgets are non-zero.

- [ ] **Step 2: Add RED tests for the 10-second timer and caller abort**

Use small deterministic timers proportional to the production policy. The
second fake invocation must outlive the first-attempt timeout but finish before
the recovery timeout. Add an already-aborted caller signal with the timeout
policy enabled and assert one attempt and `retryable=false`.

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG \
  PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 \
  AGENT_DISABLE_LLM=1 \
  node --import tsx --test tests/agent/llm/invoke-structured.test.ts
```

Expected: the new option or behavior is absent and the new tests fail.

- [ ] **Step 4: Implement the minimal default-off policy**

Add:

```ts
export type StructuredTimeoutRetryPolicy = Readonly<{
  maxRetries: number;
  retryTimeoutMs: number;
}>;
```

Normalize both fields to non-negative integers. Wrap each Provider invocation
in a labeled attempt loop. On a genuine timeout, schedule one recovery only
when the normalized policy has remaining capacity and the caller signal is not
aborted. Set the recovery attempt timer to `retryTimeoutMs`.

For every failure branch, calculate retries as:

```ts
const retryScheduled =
  !isTimeoutRecoveryAttempt && existingRetryCondition;
```

This makes the recovery attempt terminal for schema, protocol, transport, and
timeout failures.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run the Step 3 command.

Expected: existing default behavior and all new recovery tests pass with no
network or database access.

---

### Task 2: Thread the Policy Through Full Orchestrator Ownership

**Files:**
- Modify: `tests/agent/orchestration/langchain-orchestrator.test.ts`
- Modify: `src/lib/agent/orchestration/langchain-orchestrator.ts`
- Create: `src/lib/agent/orchestration/orchestrator-timeout-policy.ts`
- Modify: `tests/agent/orchestration/l3b-production-gate-evaluation.test.ts`
- Modify: `src/lib/agent/orchestration/l3b-production-gate-model-adapters.ts`

**Interfaces:**
- Consumes: `structuredRetryBudget` and existing model-call recorder.
- Produces: `structuredRetryBudget.timeout` with one recovery and evidence for two attempts in one logical call.

- [ ] **Step 1: Add a RED Full Orchestrator ownership test**

Provide sequential fake outputs: a `TimeoutError`, then a schema-valid
Orchestrator decision. Assert:

```ts
assert.equal(result.status, "success");
assert.equal(budget.orchestratorLogicalCalls, 1);
assert.equal(budget.orchestratorProviderAttempts, 2);
assert.deepEqual(startedAttempts, [1, 2]);
```

- [ ] **Step 2: Add a RED Production Full adapter evidence test**

Run one synthetic Full observation with a timed-out first attempt and valid
second response. Assert one logical call, two Provider attempts, one completed
response, one strict pass, one semantic pass, and one timeout.

- [ ] **Step 3: Run the focused Orchestrator tests and verify RED**

Run:

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG \
  PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 \
  AGENT_DISABLE_LLM=1 \
  node --import tsx --test \
  tests/agent/orchestration/langchain-orchestrator.test.ts \
  tests/agent/orchestration/l3b-production-gate-evaluation.test.ts
```

Expected: the Full retry budget cannot yet pass a timeout policy.

- [ ] **Step 4: Thread the policy without adding a logical call**

Create the shared production policy:

```ts
export const FULL_ORCHESTRATOR_TIMEOUT_POLICY = Object.freeze({
  firstAttemptTimeoutMs: 30_000,
  maxRetries: 1,
  retryTimeoutMs: 10_000,
  totalTimeoutMs: 40_000,
} as const);
```

Extend the retry budget:

```ts
structuredRetryBudget?: {
  schema: number;
  timeout?: {
    retries: number;
    retryTimeoutMs: number;
  };
  transport: number;
};
```

Map an explicit budget directly to `invokeStructured.timeoutRetryPolicy`.
When the complete budget is omitted, use the shared production policy; when a
complete budget is supplied without `timeout`, keep timeout recovery disabled.
Resolve the non-injected production model config with the shared 30-second
first-attempt timeout. Keep the existing single
`modelCallRecorder.record(...)` before `invokeStructured()`.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run the Step 3 command.

Expected: two attempt events and one logical-call record.

---

### Task 3: Close Evaluation Budget, Hash, and Denominator Contracts

**Files:**
- Modify: `src/lib/agent/orchestration/l3b-evaluation-config.ts`
- Modify: `src/lib/agent/orchestration/l3b-production-gate-budget.ts`
- Modify: `scripts/agent-production-seam-gate-eval.mjs`
- Modify: `tests/agent/orchestration/l3b-evaluation.test.ts`
- Modify: `tests/agent/orchestration/l3b-production-gate-contract.test.ts`
- Modify: `tests/agent/orchestration/l3b-production-gate-metrics.test.ts`
- Modify: `tests/TEST_MAP.md`

**Interfaces:**
- Consumes: current L3-B evaluation config hash, disclosure manifest, stage budget, and evidence-based metrics.
- Produces: hash-bound timeout recovery values, additive Full attempt ceiling, and explicit recovered-observation denominators.

- [ ] **Step 1: Add RED config and budget assertions**

Assert:

```ts
assert.equal(L3B_EVALUATION_CONFIG.orchestratorTimeoutMs, 30_000);
assert.equal(L3B_EVALUATION_CONFIG.orchestratorTimeoutRetries, 1);
assert.equal(L3B_EVALUATION_CONFIG.orchestratorTimeoutRetryMs, 10_000);
```

Extend `ProductionGateRetryLimits` with `fullTimeoutRetries`. Update budget
expectations so each reachable Full Orchestrator logical call adds exactly one
authorized attempt, while pure Query, deterministic clarify, Residual-only,
and Answer-only observations do not.

- [ ] **Step 2: Add a RED recovered-denominator assertion**

Construct Full role evidence with two attempts, one timeout, one completed
response, one strict pass, and one semantic pass. Assert:

```ts
assert.equal(metrics.provider.timeoutRate.rendered, "1/2");
assert.equal(metrics.provider.transportAvailability.rendered, "1/2");
assert.equal(metrics.provider.strictSchema.rendered, "1/1");
assert.equal(metrics.provider.semanticValidity.rendered, "1/1");
```

- [ ] **Step 3: Run the focused gate tests and verify RED**

Run:

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG \
  PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 \
  AGENT_DISABLE_LLM=1 \
  node --import tsx --test \
  tests/agent/orchestration/l3b-evaluation.test.ts \
  tests/agent/orchestration/l3b-production-gate-contract.test.ts \
  tests/agent/orchestration/l3b-production-gate-metrics.test.ts
```

Expected: the new config keys, budget field, and preflight ceiling are absent.

- [ ] **Step 4: Implement additive budget and disclosure changes**

Add the two timeout fields to `L3BEvaluationConfig`, bump the evaluation config
version, and keep the Prompt protocol version unchanged. Calculate Full
attempts as:

```ts
const fullAttempts =
  attempts(fullSchemaRetries, fullTransportRetries)
  + fullTimeoutRetries;
```

Set the live script's per-observation ceiling to `5`, include the timeout
retry in `retryLimits` and `conservativeAttemptsPerObservation`, and pass the
policy into `createProductionFullAdapter`.

- [ ] **Step 5: Update `tests/TEST_MAP.md` and verify GREEN**

Document the new focused tests and run the Step 3 command.

Expected: config hash changes deterministically, old manifests no longer
match, attempt ceilings are exact, and metric denominators remain
evidence-based.

---

### Task 4: Full Deterministic Verification and Commit

**Files:**
- Modify only files already listed in Tasks 1-3.

**Interfaces:**
- Consumes: the complete deterministic change.
- Produces: a clean committed HEAD suitable for generating new no-network live preflights.

- [ ] **Step 1: Run focused tests together**

Run all tests listed in Tasks 1-3 together and require zero failures.

- [ ] **Step 2: Run the standard deterministic baseline**

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

Expected: all deterministic suites pass; lint has no new errors; no Provider
or database access occurs.

- [ ] **Step 3: Review scope and sanitized evidence**

Confirm:

- no Prompt, schema, fixture, threshold, runtime-default, or execution change;
- no raw prompt, response, reasoning, secret, or resource identity retention;
- Router and Residual callers have no timeout policy;
- only the Full Orchestrator Production Seam adapter passes `1` and `10_000`;
- the worktree contains only the approved files.

- [ ] **Step 4: Commit the closure**

```bash
git add \
  src/lib/agent/llm/invoke-structured.ts \
  src/lib/agent/orchestration/langchain-orchestrator.ts \
  src/lib/agent/orchestration/l3b-evaluation-config.ts \
  src/lib/agent/orchestration/l3b-production-gate-budget.ts \
  src/lib/agent/orchestration/l3b-production-gate-model-adapters.ts \
  src/lib/agent/orchestration/orchestrator-timeout-policy.ts \
  scripts/agent-production-seam-gate-eval.mjs \
  tests/agent/llm/invoke-structured.test.ts \
  tests/agent/orchestration/langchain-orchestrator.test.ts \
  tests/agent/orchestration/l3b-evaluation.test.ts \
  tests/agent/orchestration/l3b-production-gate-contract.test.ts \
  tests/agent/orchestration/l3b-production-gate-evaluation.test.ts \
  tests/agent/orchestration/l3b-production-gate-metrics.test.ts \
  tests/TEST_MAP.md \
  docs/superpowers/specs/2026-07-26-l3b-full-orchestrator-timeout-retry-design.md \
  docs/superpowers/plans/2026-07-26-l3b-full-orchestrator-timeout-retry.md
git diff --cached --check
git commit -m "fix(agent): bound full orchestrator timeout recovery"
```

- [ ] **Step 5: Generate fresh no-network preflight metadata**

After the commit is clean, run Production Seam preflight-only mode for the
next authorized stage. Report the new HEAD, evaluation config hash, disclosure
manifest hash, observation count, logical-call ceiling, and Provider-attempt
ceiling.

Do not run DeepSeek until the user approves that exact new disclosure.
