# Phase L3-B-R4-A Task 8: Residual Intent Policy Closure

Status: Approved design

Approval date: 2026-07-20

Branch: `phase/l3b-r4a-query-boundary`

Baseline: `67abf154ee8eff9428e9a63ce815b4317e8b42f8`

## Goal

Make the Task 8 Hybrid Focused Provider Gate pass without weakening the
deterministic Query Boundary, changing its fixed fixtures or thresholds, adding
a semantic model call, or narrowing the semantics of unsupported compound
requests.

The required live outcome remains:

```text
qry-1 × 3: query_progress
qry-4 × 3: clarify
inj-2 × 3: query_progress
cmp-4 × 3: query_progress -> compose_checklist
```

## Evidence and root cause

The failed Gate at baseline completed all 12 observations and made three
Residual Provider calls. The nine deterministic observations passed. Every
`cmp-4` observation failed closed as `residual_forbidden_intent` after one
Provider attempt.

The safe report proves:

- Provider transport and JSON extraction completed;
- timeout and Provider failure counts were zero;
- the failure occurred in deterministic Residual validation;
- no Full Orchestrator, Answer, Commentary, Specialist, Replan, Executor, or
  database path ran.

The current runtime has two different contracts:

1. The Residual Prompt embeds a request-narrowed JSON Schema and describes
   forbidden bridge tasks.
2. `invokeStructured()` validates with the broad `residualEnvelopeSchema`,
   whose task intent accepts every Router intent.

The broad schema therefore accepts a structurally valid but request-invalid
intent. The later `validateResidualTasks()` rejects it terminally, outside the
existing schema-retry loop. The Prompt-only allowlist is not the authoritative
runtime contract.

## Rejected approaches

### Prompt-only repair

Adding more prose or another contrastive example would leave enforcement
probabilistic. The Provider has already failed after the Prompt described the
task-draft, memory, fixed-query, and bridge boundaries.

### Globally write-only Residual Planner

Removing consultation from every Residual request would make the focused
fixture easier but would violate the approved “remaining non-Query actions”
contract. Compound requests with an independent consultation action must not
silently lose it.

### Deterministic intent rewriting

Changing `answer_question` or `save_memory` into `compose_checklist`, deleting
an invalid task, or continuing with a partial plan would violate the existing
fail-closed contract. Provider output is never repaired into a business
intent.

## Architecture

### 1. Closed Hybrid eligibility

The deterministic Query Boundary gains a closed policy for compound shapes it
can prove without a model.

The first supported policy is:

```ts
type ResidualIntentPolicy = Readonly<{
  kind: "query_result_to_checklist_draft";
  allowedIntents: readonly ["compose_checklist"];
}>;
```

It applies only when the normalized request contains:

- an already-supported progress Query; and
- an explicit request to turn or organize the Query result into new tasks or a
  checklist draft.

This is the semantic category represented by `cmp-4`. Its exact intent comes
from the existing Router intent schema and shared Router protocol contract,
not from fixture expectations.

A complex Query request with another mutation or an independent consultation
action is `not_applicable` to this closed Hybrid compound policy. It continues
through the existing Full LangChain Orchestrator path. It does not enter
Legacy, disappear, or become a partial Query success.

Pure Query and deterministic clarify decisions are unchanged.

### 2. Residual planning input

`ResidualPlanningInput` gains the immutable `intentPolicy`:

```ts
type ResidualPlanningInput = Readonly<{
  originalRequest: string;
  authorizedSnapshot: ActorAuthorizedResourceSnapshot;
  fixedTasks: readonly FixedTaskSummary[];
  satisfiedIntentFamilies: readonly IntentFamily[];
  allowedIntentFamilies: readonly IntentFamily[];
  forbiddenIntentFamilies: readonly IntentFamily[];
  intentPolicy: ResidualIntentPolicy;
}>;
```

`buildResidualPlanningInput()` validates that every policy intent:

- exists in `ROUTER_INTENT_NAMES`;
- belongs to an allowed family;
- does not belong to a forbidden or satisfied family.

An invalid or empty policy fails before a Provider request.

### 3. One schema source

The Residual Planner derives an input-specific schema from the existing
`orchestratorTaskSchema`:

```ts
const taskSchema = orchestratorTaskSchema.extend({
  intent: z.enum(input.intentPolicy.allowedIntents),
});
```

An input-specific base envelope and its `.strict()` view are then derived from
the existing envelope shape with the input-specific task schema. No second
handwritten task schema or duplicated field list is introduced.

The same input-specific shape is used for:

- the JSON Schema embedded in the Residual Prompt;
- the non-strict `invokeStructured().modelSchema` view required by Provider
  adapters;
- the `.strict()` `invokeStructured().schema` view used for final validation;
- local strict validation;
- the Task 8 Preflight schema fingerprint.

The broad structural schema remains available only as a shared source for
fields that do not vary by request. It is not the final validator for a
request-specific Residual call.

For `cmp-4`, `answer_question`, `save_memory`, every Query intent, `clarify`,
and unknown intents fail at the Structured Output schema boundary. The
existing bounded schema retry may run; no semantic model call or Legacy
fallback is added.

### 4. Deterministic validation

`validateResidualTasks()` remains mandatory after schema validation and keeps
all current checks:

- allowed and forbidden family consistency;
- valid non-empty DAG;
- no consultation ancestor feeding a write;
- resource readiness;
- no Query-family task.

The validator does not rewrite, remove, reorder, or reinterpret tasks. Its
typed failure remains terminal.

### 5. Safe observability

Residual rejection gains an optional bounded enum:

```ts
type ResidualRejectionReason =
  | "intent_not_in_policy"
  | "family_forbidden"
  | "consultation_write_bridge"
  | "dag_invalid"
  | "resource_invalid";
```

The enum may enter deterministic tests and the sanitized Task 8 report. It
must not retain the raw request, Prompt, response, reasoning, task label,
arguments, IDs, titles, workspace data, actor identity, or credentials.

## Data flow

```text
authenticated context
  -> deterministic Query scope
  -> closed compound eligibility
  -> fixed query_progress
  -> ResidualIntentPolicy(["compose_checklist"])
  -> input-specific Zod/JSON Schema
  -> one logical Residual Planner call
  -> strict schema + deterministic validation
  -> deterministic Composer
  -> Candidate Validator
  -> existing Mapper
```

Unsupported compound shapes follow:

```text
closed compound eligibility = not_applicable
  -> existing Full LangChain Orchestrator
```

They never fall back to Legacy automatically.

## Error handling

- Invalid deterministic policy: fail before Provider invocation.
- Structured schema failure after the existing bounded retry: typed
  `schema_failure`, whole compound unavailable.
- Forbidden family, invalid DAG, consultation-to-write bridge, or invalid
  resource: typed unavailable, no second logical call.
- Candidate or Mapper boundary failure: existing fail-closed behavior.
- No failure becomes Query-only partial success.

## Test strategy

Tests are written and observed failing before production changes.

### Query Boundary

1. `cmp-4` produces `query_result_to_checklist_draft`.
2. Its only allowed intent is schema-valid `compose_checklist`.
3. Generic Query + independent consultation + write is not claimed by the
   closed Hybrid policy.
4. Other Query mutations remain on the Full Orchestrator path.
5. Pure Query and deterministic clarify results are unchanged.

### Residual schema

1. The input-specific Zod schema accepts `compose_checklist`.
2. It rejects `answer_question`, `save_memory`, Query intents, `clarify`, and
   unknown intents.
3. Prompt JSON Schema, model schema, strict schema, and preflight fingerprint
   derive from the same policy.
4. A fake Provider returning an invalid intent first and
   `compose_checklist` on the allowed schema retry succeeds with one logical
   call and two Provider attempts.
5. Repeated invalid output remains unavailable and never reaches Composer.

### Safety and regression

1. No invalid task is rewritten or dropped.
2. Composer still attaches the residual root to fixed `t1`.
3. Candidate Validator and Mapper remain ordered and fail closed.
4. Full Orchestrator, Answer, Commentary, Specialist, and Replan counts remain
   zero in the focused Gate.
5. Task execution, database connection/mutation, duplicate calls, and raw
   retention remain zero.
6. Legacy remains the default Orchestrator Runtime; Query Runtime/adoption
   defaults remain unchanged.

## Verification

Run focused R4-A tests, then:

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run typecheck
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:agent
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:agent:planning
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:agent:schedule
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:content
npm run check:typography
npm run lint
npx eslint . --ignore-pattern '.claude/worktrees/**'
git diff --check
```

Only after deterministic verification and a clean accepted HEAD may the same
Task 8 Gate run again. The Gate must still satisfy:

```text
observations = 12/12
semantic matches = 12/12
acceptable final results = 12/12
strict residual schema = 3/3
```

All safety, mutation, duplicate-call, Provider-failure, timeout, and
raw-retention counters must remain zero.

## Out of scope

- Fixture, expectation, denominator, or Gate-threshold changes;
- Provider, temperature, output budget, timeout, or retry changes;
- Full Orchestrator Prompt changes;
- Query scope contract or Query allowlist expansion;
- Mapper, Draft, Dry-run, Policy Guard, Confirmation, Executor, Receipt,
  Rollback, LangGraph topology, checkpoint, Payload schema, or migration
  changes;
- Legacy deletion, Runtime-default switch, Targeted 15, full 33, Fresh 99, or
  adoption.
