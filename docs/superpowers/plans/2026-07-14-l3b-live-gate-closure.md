# L3-B Live Gate Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the L3-B fixture, retry, accounting, semantic-denominator, resource-protocol, and answer-budget contracts so the unchanged 33-fixture matrix can pass a reproducible acceptance run and then a fresh 99-observation stability gate without changing the default Legacy runtime.

**Architecture:** Keep `invokeStructured()` and `runLangChainOrchestratorResult()` as the only structured Provider path. Add sanitized attempt events and schema-valid decision projections, derive Prompt resource rules from the deterministic guard, and calculate adoption gates from authoritative observations while retaining attempt diagnostics separately. Freeze a secret-free evaluation config, keep known-ID probes outside all denominators, and apply the 384-token limit only to conversational answers.

**Tech Stack:** TypeScript, Node test runner, Zod, LangChain, existing npm validation scripts, explicit DeepSeek V4-Pro harness.

## Global Constraints

- Default/unknown/unset `AGENT_ORCHESTRATOR_RUNTIME` remains Legacy.
- Do not enter Draft, Dry-run, Policy Guard, Confirmation, Execute, Receipt, or Rollback.
- Do not modify Primary decisions, LangGraph, checkpoints, Payload schemas, migrations, query dispatch, or execute handoff.
- Do not delete Legacy components, add dependencies, add a parallel schema, or parse JSON with regex/substrings.
- Never retain raw prompts, responses, reasoning, context, partial answers, secrets, or Provider bodies.
- Gating data remains the same 33 fixture IDs/messages/tags/expectations; diagnostics are Plan-only and outside all denominators.
- `TRANSPORT_RETRIES=1`, `SCHEMA_RETRIES=0`, `SEMANTIC_RETRIES=0`; timeout is never retried.
- `ANSWER_MAX_OUTPUT_TOKENS=384`, `ANSWER_MAX_PARAGRAPHS=4`, `ANSWER_FIRST_TOKEN_TIMEOUT_MS=8000`, `ANSWER_TOTAL_TIMEOUT_MS=30000`.
- Frozen Provider settings are `deepseek`, `deepseek-v4-pro`, `https://api.deepseek.com`, temperature `0.1`, `provider_default`, and Orchestrator timeout `30000ms`.
- Versions are `l3b-live-gate-v2`, `l3b-orchestrator-v2`, Orchestrator schema `1`, and resource protocol `1`; Orchestrator output tokens remain the frozen literal `provider_default`.
- Acceptance and stability use one frozen config hash. Any config change restarts acceptance.
- Live evaluation remains explicit, database-disconnected, outside default CI, and is never automatically pushed.

## File structure

- Create `src/lib/agent/orchestration/l3b-evaluation-config.ts` for versioned secret-free constants/hash.
- Modify `resource-readiness-guard.ts` to expose a projection of its existing requirement table.
- Modify `langchain-orchestrator.ts` to render that projection and expose sanitized schema-valid decisions on guard failures.
- Modify `l3b-evaluation-fixtures.ts` to restore title-only contexts and define separate Plan diagnostics.
- Modify `invoke-structured.ts` to whitelist retries and emit sanitized attempt lifecycle events.
- Modify `model-config.ts`, `model-factory.ts`, and `answer/runtime.ts` for the answer-only output budget.
- Modify `model-call-budget.ts`, `l3b-evaluation.ts`, and the live harness for logical/attempt and observation/attempt separation.
- Update focused tests and `tests/TEST_MAP.md`.

---

### Task 1: Restore fixture and resource protocol contracts

**Files:**
- Modify: `src/lib/agent/orchestration/resource-readiness-guard.ts`
- Modify: `src/lib/agent/orchestration/l3b-evaluation-fixtures.ts`
- Modify: `src/lib/agent/orchestration/langchain-orchestrator.ts`
- Test: `tests/agent/orchestration/resource-readiness-guard.test.ts`
- Test: `tests/agent/orchestration/l3b-evaluation.test.ts`
- Test: `tests/agent/orchestration/langchain-orchestrator.test.ts`

**Interfaces:**
- Produces `getResourceProtocolProjection(): readonly ResourceProtocolEntry[]` from `RESOURCE_REQUIREMENTS`.
- Produces `L3B_KNOWN_ID_DIAGNOSTICS: readonly L3BKnownIdDiagnostic[]`; every item has `gating:false`.

- [ ] **Step 1: Write failing tests**

```ts
const entry = getResourceProtocolProjection().find((item) => item.intent === "schedule_plan");
assert.deepEqual(entry, {
  allowedProducerIntents: ["compose_plan", "create_plan"],
  existingIdFields: ["planId"],
  intent: "schedule_plan",
  outputRefFields: ["planRef"],
  resourceKind: "plan",
});
for (const id of ["wrt-5", "cmp-2", "exr-1", "exr-2", "exr-3"]) {
  const fixture = L3B_EVALUATION_FIXTURES.find((item) => item.id === id)!;
  assert.equal(fixture.context.plans[0]?.title, "考研数学复习计划");
  assert.equal(fixture.context.plans[0]?.id, null);
}
assert.equal(L3B_KNOWN_ID_DIAGNOSTICS.length, 6);
```

Also assert the Prompt renders every projection entry plus exact-copy, title-only, conflicting-ID, task-output dependency, and `cmp-2` ambiguity rules.

- [ ] **Step 2: Verify RED**

```bash
node --import tsx --test tests/agent/orchestration/resource-readiness-guard.test.ts tests/agent/orchestration/l3b-evaluation.test.ts tests/agent/orchestration/langchain-orchestrator.test.ts
```

Expected: missing exports and current `id=101` title-only fixtures fail.

- [ ] **Step 3: Implement the projection and fixtures**

```ts
export type ResourceProtocolEntry = Readonly<{
  allowedProducerIntents: readonly string[];
  existingIdFields: readonly string[];
  intent: string;
  outputRefFields: readonly string[];
  resourceKind: ResourceKind;
}>;
export const getResourceProtocolProjection = (): readonly ResourceProtocolEntry[] =>
  Object.freeze(Object.entries(RESOURCE_REQUIREMENTS).map(([intent, requirement]) => Object.freeze({
    allowedProducerIntents: Object.freeze([...requirement.allowedProducerIntents]),
    existingIdFields: Object.freeze([...requirement.existingIdFields]),
    intent,
    outputRefFields: Object.freeze([...requirement.outputRefFields]),
    resourceKind: requirement.resourceKind,
  })));
```

Use `{id:null,title:"考研数学复习计划",...}` for the five title-only gating fixtures. Define the six diagnostics: existing ID, task-output ref, outside ID, placeholder, title+valid ID, and title+conflicting ID.

- [ ] **Step 4: Render compact projection lines in the Prompt**

```ts
const resourceProtocol = getResourceProtocolProjection().map((entry) =>
  `${entry.intent}: kind=${entry.resourceKind}; existing=${entry.existingIdFields.join("|") || "none"}; outputRef=${entry.outputRefFields.join("|") || "none"}; producers=${entry.allowedProducerIntents.join("|") || "none"}`,
).join("\n");
```

- [ ] **Step 5: Verify GREEN and commit**

Run Step 2, then:

```bash
git add src/lib/agent/orchestration/resource-readiness-guard.ts src/lib/agent/orchestration/l3b-evaluation-fixtures.ts src/lib/agent/orchestration/langchain-orchestrator.ts tests/agent/orchestration/resource-readiness-guard.test.ts tests/agent/orchestration/l3b-evaluation.test.ts tests/agent/orchestration/langchain-orchestrator.test.ts
git commit -m "fix(agent): restore L3-B resource fixture contract"
```

### Task 2: Whitelist transport retries and observe attempts

**Files:**
- Modify: `src/lib/agent/llm/invoke-structured.ts`
- Modify: `src/lib/agent/orchestration/langchain-orchestrator.ts`
- Test: `tests/agent/llm/invoke-structured.test.ts`
- Test: `tests/agent/orchestration/langchain-orchestrator.test.ts`

**Interfaces:**
- Produces `StructuredProviderAttemptEvent`, `StructuredProviderAttemptObserver`, and `classifyStructuredTransportRetry(error)`.
- `runLangChainOrchestratorResult()` forwards an optional observer unchanged.

- [ ] **Step 1: Write failing tests**

Test `ECONNRESET`, `ECONNREFUSED`, 429, and 500/502/503/504 as retryable. Test 400/401/403, `ETIMEDOUT`, `TimeoutError`, parser/schema failures, response-bearing errors, and unknown errors as non-retryable. An `ECONNRESET` then success must emit:

```ts
[
  { attempt: 1, phase: "started" },
  { attempt: 1, phase: "failed", reason: "connection_reset", retryScheduled: true },
  { attempt: 2, phase: "started" },
  { attempt: 2, phase: "succeeded" },
]
```

- [ ] **Step 2: Verify RED**

```bash
node --import tsx --test tests/agent/llm/invoke-structured.test.ts tests/agent/orchestration/langchain-orchestrator.test.ts
```

- [ ] **Step 3: Implement the classifier and sanitized events**

```ts
export type StructuredRetryReason = "connection_reset" | "network_transport" | "provider_5xx" | "rate_limit";
export const classifyStructuredTransportRetry = (error: unknown): StructuredRetryReason | null => {
  if (!(error instanceof Error)) return null;
  const item = error as Error & { code?: unknown; status?: unknown; response?: unknown; responseBody?: unknown };
  if (item.response !== undefined || item.responseBody !== undefined) return null;
  if (item.code === "ECONNRESET") return "connection_reset";
  if (["ECONNREFUSED", "ENETUNREACH", "EAI_AGAIN"].includes(String(item.code))) return "network_transport";
  if (item.status === 429) return "rate_limit";
  if ([500, 502, 503, 504].includes(Number(item.status))) return "provider_5xx";
  return null;
};
```

Keep timeout/abort/parser branches before this classifier. Non-whitelisted failures return typed `MODEL_UNAVAILABLE` without retry. Observer events never contain raw errors.

- [ ] **Step 4: Verify GREEN and commit**

Run Step 2, then:

```bash
git add src/lib/agent/llm/invoke-structured.ts src/lib/agent/orchestration/langchain-orchestrator.ts tests/agent/llm/invoke-structured.test.ts tests/agent/orchestration/langchain-orchestrator.test.ts
git commit -m "fix(agent): constrain structured transport retries"
```

### Task 3: Preserve safe schema-valid decisions after guard failure

**Files:**
- Modify: `src/lib/agent/orchestration/langchain-orchestrator.ts`
- Test: `tests/agent/orchestration/langchain-orchestrator.test.ts`

**Interfaces:**
- Produces `OrchestratorDecisionProjection = {intents: readonly string[]; mode: OrchestratorMode}`.
- Adds `schemaValidDecision` only to invalid-DAG/resource typed failures; never includes args, labels, IDs, or raw output.

- [ ] **Step 1: Write the failing projection tests**

```ts
assert.deepEqual(result.schemaValidDecision, {
  intents: ["schedule_plan"],
  mode: "single",
});
assert.doesNotMatch(JSON.stringify(result), /planId|999|rawResponse/);
```

Cover both invalid resource and invalid DAG.

- [ ] **Step 2: Verify RED**

```bash
node --import tsx --test tests/agent/orchestration/langchain-orchestrator.test.ts
```

- [ ] **Step 3: Project immediately after strict schema success**

```ts
const schemaValidDecision = Object.freeze({
  intents: Object.freeze(result.data.tasks.map((task) => task.intent)),
  mode: result.data.mode,
});
```

Attach it to later deterministic failures without repairing or reinterpreting the decision.

- [ ] **Step 4: Verify GREEN and commit**

```bash
node --import tsx --test tests/agent/orchestration/langchain-orchestrator.test.ts
git add src/lib/agent/orchestration/langchain-orchestrator.ts tests/agent/orchestration/langchain-orchestrator.test.ts
git commit -m "fix(agent): expose sanitized orchestrator decisions"
```

### Task 4: Separate logical calls, attempts, and observation gates

**Files:**
- Modify: `src/lib/agent/orchestration/model-call-budget.ts`
- Modify: `src/lib/agent/orchestration/l3b-evaluation.ts`
- Test: `tests/agent/orchestration/model-call-budget.test.ts`
- Test: `tests/agent/orchestration/l3b-evaluation.test.ts`

**Interfaces:**
- Adds `recordProviderAttempt(role: ModelCallRole)` and per-role attempt counters.
- Adds run fields `hadTransportFailure`, `hadTransportTimeout`, attempt counts/reasons, and `unexpectedWriteCandidate`.
- Semantic denominators include every `schemaValidResponses>0` run, regardless of usability.
- Reports `legacySpecialistCallCount`, `specialistBypassCount`, `specialistRequiredCount`, and `unexpectedDuplicateModelCalls`; only the last is a hard L3-B failure.

- [ ] **Step 1: Write failing denominator/accounting tests**

Create 99 runs where one observation has two attempts, one failed attempt, a recovered success, and `hadTransportTimeout=true`. Assert:

```ts
assert.equal(report.metrics.providerAttempts, 100);
assert.equal(report.metrics.providerTimeoutRate, 1 / 99);
assert.equal(report.metrics.providerTimeoutObservationRate, 1 / 99);
assert.equal(report.metrics.providerAttemptTransportSuccessRate, 99 / 100);
assert.equal(report.metrics.recoveredRetryObservations, 1);
assert.equal(report.pass, false);
```

Add a schema-valid/resource-invalid clarify-to-write run and assert semantic denominator 99 and unsafe count 1. Add logical/attempt snapshot assertions and scope-ID non-retention.

- [ ] **Step 2: Verify RED**

```bash
node --import tsx --test tests/agent/orchestration/model-call-budget.test.ts tests/agent/orchestration/l3b-evaluation.test.ts
```

- [ ] **Step 3: Implement accounting and observation formulas**

```ts
const schemaValidDecisions = runs.filter((run) => run.schemaValidResponses > 0);
const timeoutObservations = countTrue(runs, "hadTransportTimeout");
const transportCleanCompletions = runs.filter((run) =>
  !run.hadTransportFailure && run.completedProviderResponses > 0).length;
```

`providerTimeoutRate` remains an observation-level alias. Attempts are diagnostic only. `clarifyToWriteMismatch`, `readToWriteMismatch`, and `unexpectedWriteCandidate` are counted before resource/usability filtering. Retry attempts never increment logical calls.

The snapshot exposes `orchestratorLogicalCalls`, `orchestratorProviderAttempts`, `replanLogicalCalls`, `answerLogicalCalls`, `answerProviderAttempts`, `specialistLogicalCalls`, `specialistProviderAttempts`, and `unexpectedDuplicateModelCalls`. Logical budgets remain one Orchestrator per decision, one replan per explicit event, one answer only without a complete authoritative answer, and one specialist per task only when the deterministic completeness predicate requires it.

- [ ] **Step 4: Verify GREEN and commit**

Run Step 2, then:

```bash
git add src/lib/agent/orchestration/model-call-budget.ts src/lib/agent/orchestration/l3b-evaluation.ts tests/agent/orchestration/model-call-budget.test.ts tests/agent/orchestration/l3b-evaluation.test.ts
git commit -m "fix(agent): gate L3-B availability by observation"
```

### Task 5: Freeze config and apply the answer-only budget

**Files:**
- Create: `src/lib/agent/orchestration/l3b-evaluation-config.ts`
- Modify: `src/lib/agent/llm/model-config.ts`
- Modify: `src/lib/agent/llm/model-factory.ts`
- Modify: `src/lib/agent/answer/runtime.ts`
- Test: `tests/agent/llm/model-config.test.ts`
- Test: `tests/agent/conversational-answer-runtime.test.ts`
- Test: `tests/agent/orchestration/l3b-evaluation.test.ts`

**Interfaces:**
- Produces `L3B_EVALUATION_CONFIG`, `L3B_EVALUATION_CONFIG_HASH`, and version constants.
- Adds optional `maxOutputTokens?: number` to `ModelConfig`; factory maps it to `ChatOpenAI.maxTokens`.
- Exports the four exact answer constants.

- [ ] **Step 1: Write failing tests**

Assert the config is frozen, contains the exact approved values and no secret field, and hashes a recursively key-sorted canonical JSON object. Capture answer `modelFactory` config and assert `maxOutputTokens===384`; assert Prompt says no more than four short paragraphs.

- [ ] **Step 2: Verify RED**

```bash
node --import tsx --test tests/agent/llm/model-config.test.ts tests/agent/conversational-answer-runtime.test.ts tests/agent/orchestration/l3b-evaluation.test.ts
```

- [ ] **Step 3: Implement optional model output tokens**

Add `maxOutputTokens?: number` to `ModelConfig` and `createModelConfig()`, validate it as a positive integer, and pass `maxTokens: config.maxOutputTokens` in `model-factory.ts`. Omitted values preserve Provider defaults.

- [ ] **Step 4: Apply only in answer model resolution**

```ts
export const ANSWER_MAX_OUTPUT_TOKENS = 384;
export const ANSWER_MAX_PARAGRAPHS = 4;
export const ANSWER_FIRST_TOKEN_TIMEOUT_MS = 8_000;
export const ANSWER_TOTAL_TIMEOUT_MS = 30_000;
```

Clone the resolved answer config with `maxOutputTokens:384`; never mutate Orchestrator/specialist configs. Preserve complete/unavailable/incomplete persistence behavior.

- [ ] **Step 5: Build the secret-free config/hash**

Export the exact design constants. Hash recursively key-sorted JSON with `createHash("sha256")`; the API key is not an accepted input.

- [ ] **Step 6: Verify GREEN and commit**

Run Step 2, then:

```bash
git add src/lib/agent/orchestration/l3b-evaluation-config.ts src/lib/agent/llm/model-config.ts src/lib/agent/llm/model-factory.ts src/lib/agent/answer/runtime.ts tests/agent/llm/model-config.test.ts tests/agent/conversational-answer-runtime.test.ts tests/agent/orchestration/l3b-evaluation.test.ts
git commit -m "fix(agent): freeze L3-B answer evaluation budget"
```

### Task 6: Rebuild the explicit harness around frozen contracts

**Files:**
- Modify: `scripts/agent-orchestrator-canary-eval.mjs`
- Modify: `src/lib/agent/orchestration/l3b-evaluation.ts`
- Modify: `tests/agent/orchestration/l3b-evaluation.test.ts`
- Modify: `tests/TEST_MAP.md`

**Interfaces:**
- Consumes frozen config, attempt events, schema-valid decisions, restored fixtures, and Plan diagnostics.
- Produces separate `gating` and `knownIdDiagnostics` report sections; only `gating` determines pass.

- [ ] **Step 1: Write failing harness/report tests**

Assert transport retry 1/schema retry 0, frozen config import/hash, attempt observer, all role/specialist metrics, retry distribution, schema-valid mismatch comparison, diagnostic separation, and absence of database imports/raw retention.

- [ ] **Step 2: Verify RED**

```bash
node --import tsx --test tests/agent/orchestration/l3b-evaluation.test.ts
```

- [ ] **Step 3: Implement sanitized event and decision aggregation**

For every `started` event increment attempts; for every `failed` event increment failure/retry-reason counters and observation flags; for every `succeeded` event increment successes. Use `schemaValidDecision` before resource classification. Record one logical Orchestrator call per fixture/round and one answer call only when no complete answer exists.

- [ ] **Step 4: Separate acceptance/stability and diagnostics**

`L3B_EVAL_ROUNDS=1` runs 33 gating observations; `3` runs a fresh 99. Print and store the same config hash. Run six diagnostics separately and exclude them from strict schema, semantic, availability, coverage, latency, API/cost gating, and the observation minimum.

- [ ] **Step 5: Update TEST_MAP, verify GREEN, and commit**

```bash
node --import tsx --test tests/agent/orchestration/l3b-evaluation.test.ts tests/agent/orchestration/langchain-orchestrator.test.ts tests/agent/llm/invoke-structured.test.ts tests/agent/conversational-answer-runtime.test.ts tests/agent/orchestration/model-call-budget.test.ts tests/agent/orchestration/resource-readiness-guard.test.ts
git add scripts/agent-orchestrator-canary-eval.mjs src/lib/agent/orchestration/l3b-evaluation.ts tests/agent/orchestration/l3b-evaluation.test.ts tests/TEST_MAP.md
git commit -m "test(agent): close L3-B live evaluation harness"
```

### Task 7: Deterministic baseline and explicit Live Gate

**Files:**
- Modify only when a test exposes an in-scope defect; return to its RED/GREEN task.
- Never commit `/tmp/l3b-*.json`.

**Interfaces:**
- Produces deterministic evidence, a 33-observation acceptance report, and only after safe acceptance, a fresh 99-observation stability report.

- [ ] **Step 1: Run the deterministic baseline**

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run typecheck
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:agent
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:agent:planning
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:agent:schedule
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:content
npm run lint
npm run check:typography
git diff --check
```

Expected: zero failures and no new lint errors; report baseline warnings separately.

- [ ] **Step 2: Run the database-disconnected acceptance matrix**

```bash
env -u DATABASE_URL AGENT_LIVE_LLM_EVAL=1 L3B_EVAL_ROUNDS=1 node --import dotenv/config --import tsx scripts/agent-orchestrator-canary-eval.mjs
```

Expected: 33 inherited fixtures, frozen hash, zero unsafe/execution/mutation metrics, and separate diagnostics. Stop if any unsafe gate fails.

- [ ] **Step 3: Run fresh stability only after acceptance safety passes**

```bash
env -u DATABASE_URL AGENT_LIVE_LLM_EVAL=1 L3B_EVAL_ROUNDS=3 node --import dotenv/config --import tsx scripts/agent-orchestrator-canary-eval.mjs
```

Expected: exactly 99 gating observations with the same hash. One timeout is `1/99` and fails.

- [ ] **Step 4: Report without relaxing gates**

Report schema/semantic/resource/usable layers, observation availability, attempt diagnostics, retry reasons, logical roles, specialist metrics, latency, calls/cost, unsafe counters, diagnostics, execution/mutation, default runtime, commit SHAs, and rollback commands. If Live fails, keep implementation, leave Legacy default, and stop.

- [ ] **Step 5: Final repository check**

```bash
git status --short --branch
git diff --check
```

Create no empty evidence commit and never push automatically.
