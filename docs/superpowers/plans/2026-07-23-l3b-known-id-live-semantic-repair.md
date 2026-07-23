# L3-B Known-ID Live Semantic Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make existing-plan scheduling distinguish trusted, missing, conflicting, and new-plan references in the production Full Orchestrator, while keeping Known-ID rejection evidence and Provider-attempt accounting accurate.

**Architecture:** Add one shared Full-only scheduling-reference contract rendered into the existing Orchestrator Prompt, then classify Known-ID safe rejection from either the deterministic Resource Guard or an exact schema-valid missing-resource decision. Preserve the existing post-model validators and use `projectModelCallBudget()` to adapt the recorder snapshot before the live harness counts Provider attempts.

**Tech Stack:** TypeScript, Zod-backed Orchestrator protocol, LangChain fake models, existing production evaluation harness, Node test runner.

## Global Constraints

- Do not call DeepSeek or any external Provider during implementation.
- Do not connect to a database.
- Keep the six Known-ID messages, contexts, order, and top-level expectations unchanged.
- Do not change Structured Output schemas, model, output budget, timeout, retry policy, Gate thresholds, or Runtime defaults.
- Do not reinterpret an accepted invalid write as safe.
- Do not enter Draft, Dry-run, Policy, Confirmation, Executor, Receipt, Rollback, or business persistence.
- Do not retain raw Prompt, response, reasoning, task args, resource IDs, workspace values, errors, stacks, or secrets.
- Do not overwrite `/tmp/l3b-r8-production-known-id.json`.
- Use `/tmp/l3b-r8-production-known-id-v2.json` as the next exclusive Known-ID report path.
- Do not push.

---

## File Structure

- `src/lib/agent/orchestration/orchestrator-intent-family-protocol.ts`
  owns the shared existing-plan scheduling cases and renders the Full-only rule body.
- `src/lib/agent/orchestration/langchain-orchestrator.ts`
  continues to compose the system Prompt from shared protocol constants.
- `src/lib/agent/orchestration/hybrid-production-evaluation.ts`
  distinguishes Provider missing-resource rejection from Resource Guard rejection.
- `scripts/agent-production-seam-gate-eval.mjs`
  projects the recorder snapshot before counting attempts and reports the bounded rejection source.
- Focused tests:
  - `tests/agent/orchestration/orchestrator-semantic-contrast-protocol.test.ts`
  - `tests/agent/orchestration/l3b-production-gate-evaluation.test.ts`
  - `tests/agent/orchestration/l3b-production-gate-contract.test.ts`
  - `tests/TEST_MAP.md`

---

### Task 1: Existing-Plan Scheduling Protocol

**Files:**
- Modify: `tests/agent/orchestration/orchestrator-semantic-contrast-protocol.test.ts`
- Modify: `src/lib/agent/orchestration/orchestrator-intent-family-protocol.ts`
- Modify: `src/lib/agent/orchestration/langchain-orchestrator.ts`

**Interfaces:**
- Consumes: current decision-code, mode, intent, and Resource Guard names.
- Produces:

```ts
export const ORCHESTRATOR_PLAN_SCHEDULE_REFERENCE_MARKER:
  "[orchestrator-boundary:plan-schedule-reference]";

export const ORCHESTRATOR_PLAN_SCHEDULE_REFERENCE_PROTOCOL: string;
```

- [ ] **Step 1: Write the failing protocol test**

Assert the shared protocol contains and the Full Prompt renders these exclusive cases:

```text
trusted_existing_plan_id
  -> explicit_write_ready / single / schedule_plan
untrusted_existing_plan_reference
  -> explicit_write_missing_resource / single / clarify
new_plan_schedule_dependency
  -> compound_missing_target / single / clarify
```

Also assert the positive trusted case explicitly forbids
`compound_missing_target`, and no canonical fixture message is copied into the
Prompt.

- [ ] **Step 2: Run the protocol test and verify RED**

```bash
env -u DATABASE_URL \
  PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 \
  AGENT_DISABLE_LLM=1 \
  node --import tsx --test \
  tests/agent/orchestration/orchestrator-semantic-contrast-protocol.test.ts
```

Expected: fail because the plan-schedule-reference exports and Prompt marker do
not exist.

- [ ] **Step 3: Implement the shared protocol**

Define schema-typed metadata for the three cases and render it from
`orchestrator-intent-family-protocol.ts`. The rules must state:

- one scheduling request for an actor-authorized plan is a single write candidate;
- a positive user-provided ID must match the actor-authorized context ID;
- placeholder, absent, outside, or title-conflicting references clarify with
  `explicit_write_missing_resource`;
- only creating a new plan and scheduling its unavailable runtime output uses
  `compound_missing_target`;
- no rule authorizes execution or Provider-selected IDs.

Insert only `ORCHESTRATOR_PLAN_SCHEDULE_REFERENCE_PROTOCOL` into
`buildLangChainSystemPrompt()`.

- [ ] **Step 4: Run the protocol test and verify GREEN**

Run the Step 2 command and require zero failures.

---

### Task 2: Known-ID Rejection Provenance

**Files:**
- Modify: `tests/agent/orchestration/l3b-production-gate-evaluation.test.ts`
- Modify: `src/lib/agent/orchestration/hybrid-production-evaluation.ts`

**Interfaces:**
- Consumes: final typed intent, Full role evidence, semantic projection, and
  deterministic resource issue codes.
- Produces:

```ts
export type ProductionKnownIdRejectionSource =
  | "provider_missing_resource"
  | "resource_readiness_guard";

ProductionGateObservation["knownIdRejectionSource"]:
  ProductionKnownIdRejectionSource | null;
```

- [ ] **Step 1: Write failing fake-model tests**

Add cases proving:

```ts
explicit_write_missing_resource + clarify
  => safe_rejection / provider_missing_resource

compound_missing_target + clarify
  => safe_rejection / provider_missing_resource

resource-readiness clarify or invalid_resource_reference
  => safe_rejection / resource_readiness_guard

unsupported_request + clarify
  => unrelated_failure / null

explicit_write_ready + accepted outside ID
  => unsafe_acceptance / null
```

The two exact-reference fixtures must still require `exact_reference`; a
Provider clarify cannot pass them. Every observation must remain free of raw
messages, titles, IDs, task args, responses, reasoning, and secrets.

- [ ] **Step 2: Run evaluator tests and verify RED**

```bash
env -u DATABASE_URL \
  PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 \
  AGENT_DISABLE_LLM=1 \
  node --import tsx --test \
  tests/agent/orchestration/l3b-production-gate-evaluation.test.ts
```

Expected: fail because Provider missing-resource decisions are currently
classified as `unrelated_failure` and no rejection source exists.

- [ ] **Step 3: Implement bounded provenance classification**

Accept Provider rejection only when all conditions hold:

- Full status is `success`;
- final task is exactly `clarify` with a non-empty question;
- semantic projection decision code is exactly
  `explicit_write_missing_resource` or `compound_missing_target`;
- no write intent is accepted and no terminal failure exists.

Keep the existing Resource Guard path and label it
`resource_readiness_guard`. Schema, transport, timeout, generic clarify,
`unsupported_request`, query-scope rejection, and accepted writes remain
failures.

- [ ] **Step 4: Run evaluator tests and verify GREEN**

Run the Step 2 command and require zero failures.

---

### Task 3: Recorder Attempt Adapter

**Files:**
- Modify: `tests/agent/orchestration/l3b-production-gate-contract.test.ts`
- Modify: `scripts/agent-production-seam-gate-eval.mjs`
- Modify: `tests/TEST_MAP.md`

**Interfaces:**
- Consumes: `TurnModelCallBudget` returned by `recorder.snapshot()`.
- Produces: a `ModelCallBudgetProjection` passed to the existing
  `providerAttemptCount()` helper.

- [ ] **Step 1: Write the failing harness contract**

Require the live script to import `projectModelCallBudget`, settle:

```js
providerAttemptCount(projectModelCallBudget(recorder.snapshot()))
```

inside `finally`, never count the raw recorder snapshot directly, and project:

```js
knownIdRejectionSource: observation.knownIdRejectionSource
```

Also require `known_id` to use the unused exclusive path:

```text
/tmp/l3b-r8-production-known-id-v2.json
```

- [ ] **Step 2: Run the contract test and verify RED**

```bash
env -u DATABASE_URL \
  PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 \
  AGENT_DISABLE_LLM=1 \
  node --import tsx --test \
  tests/agent/orchestration/l3b-production-gate-contract.test.ts
```

Expected: fail because raw recorder field names differ from projection names.

- [ ] **Step 3: Implement the adapter and update the test map**

Import `projectModelCallBudget` beside `createModelCallBudgetRecorder`, use it
only at the recorder settlement boundary, and add the bounded rejection source
to the report projection. Change only the `known_id` fixed path to
`/tmp/l3b-r8-production-known-id-v2.json`; all other stage paths remain
unchanged. Document both contracts in `tests/TEST_MAP.md`.

- [ ] **Step 4: Run the contract test and verify GREEN**

Run the Step 2 command and require zero failures.

---

### Task 4: Verification, Commit, and New Preflight

**Files:**
- Verify only the files from Tasks 1-3 and this plan.

**Interfaces:**
- Produces: one clean implementation commit and a new exact-HEAD Provider
  authorization envelope.

- [ ] **Step 1: Run focused deterministic verification**

```bash
env -u DATABASE_URL \
  PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 \
  AGENT_DISABLE_LLM=1 \
  node --import tsx --test \
  tests/agent/orchestration/orchestrator-semantic-contrast-protocol.test.ts \
  tests/agent/orchestration/l3b-production-gate-evaluation.test.ts \
  tests/agent/orchestration/l3b-production-gate-contract.test.ts \
  tests/agent/orchestration/l3b-production-gate-metrics.test.ts

env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run typecheck
npx eslint <all changed code and test files>
git diff --check
```

- [ ] **Step 2: Run the full Agent suite**

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm test
```

Require zero failures. Database-dependent skips remain explicitly reported.

- [ ] **Step 3: Commit independently**

```bash
git add <only Task 1-3 files plus this plan>
git diff --cached --check
git commit -m "fix(agent): distinguish trusted plan scheduling"
```

- [ ] **Step 4: Preserve prior evidence and run a no-network preflight**

Do not delete or overwrite `/tmp/l3b-r8-production-known-id.json`. Require the
new fixed report path `/tmp/l3b-r8-production-known-id-v2.json` to be absent,
then run preflight with no API key and require zero Provider attempts.

- [ ] **Step 5: Stop for new Provider authorization**

Disclose the unchanged six synthetic messages and contexts, the changed Full
system rules, strict schema, exact new HEAD, exclusive report path, six logical
calls, and 24 Provider attempts. Do not reuse the authorization for
`1bd9bebd6c8ae25dfa854db56a7fcdf30e704d37`.
