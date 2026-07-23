# L3-B Known-ID Production Semantics Repair Design

## Status

Approved approach: repair the existing production-seam evaluator so the six
canonical Known-ID diagnostics are evaluated under their own semantic contract,
and make Provider-attempt accounting survive an observation-level exception.

The business objective is to unblock the smallest remaining live safety Gate
needed before a controlled LangChain launch. This phase does not broaden Agent
capabilities or authorize another Provider run.

## Live Failure Evidence

At HEAD `8b8e665e59fb92cf19ca9ea3d61b9c6f63c123f1`:

- the clean Known-ID preflight was ready for six observations;
- the first Full Orchestrator logical call returned a completed, single-task
  structured result;
- the process then terminated with `UNEXPECTED_FAILURE`;
- the remaining five observations were not started;
- no report file was created;
- no real database, task execution, or business mutation path was available;
- the worktree remained clean.

The failed process printed `providerAttempts: 0`, but that value is invalid.
The completed logical call required at least one Provider attempt and could
have used at most four under the approved retry ceiling. The exact count was
lost because the script settled attempts only after an observation returned.

## Root Cause

### Fixture contract mismatch

`getL3BProductionStageCases("known_id")` correctly returns
`L3BKnownIdDiagnostic` objects, whose expectation is:

```ts
"accept_exact_reference" | "reject_invalid_reference"
```

`evaluateProductionGateCase()` is typed only for `L3BEvaluationFixture` and
unconditionally evaluates:

```ts
input.fixture.expected.intents.includes(...)
```

The Known-ID expectation is a string, so the evaluator throws after the model
has returned but before the observation can be projected.

### Failure accounting gap

The live script currently adds attempts from
`observation.callAccounting` only after `evaluateProductionGateCase()` returns.
If projection or aggregation throws, recorder state is discarded and the
top-level failure output incorrectly reports zero attempts.

### Generic Gate semantics are insufficient

Known-ID diagnostics intentionally expect one of two outcomes:

- an exact, actor-authorized plan reference is accepted; or
- an invalid reference is safely rejected with deterministic resource
  evidence.

The generic fixture matcher cannot express this. Generic zero-tolerance
resource counters would also treat an expected typed rejection as a Gate
failure, even though that rejection is the diagnostic's required result.

## Goals

1. Let the production evaluator consume the existing canonical union:
   `L3BEvaluationFixture | L3BKnownIdDiagnostic`.
2. Keep ordinary Acceptance, Focused, and Stability semantics unchanged.
3. Evaluate Known-ID results with a deterministic, sanitized contract.
4. Count every started Provider attempt even when an observation throws.
5. Preserve typed Provider/schema/transport failures as failures; they must not
   masquerade as safe resource rejection.
6. Keep every execution, persistence, database, Prompt, schema, Provider,
   retry, threshold, and Runtime-default boundary unchanged.

## Non-goals

- Do not change the six messages, contexts, ordering, or expectations.
- Do not change Full or Residual system rules or Structured Output schemas.
- Do not add message parsing, regex JSON extraction, argument repair, or
  Provider-output reinterpretation.
- Do not change the model, output budget, timeout, retries, Gate thresholds, or
  evaluation config hash.
- Do not switch the Orchestrator, Query, Router, or graph Runtime default.
- Do not enter Draft, Dry-run, Policy, Confirmation, Executor, Receipt, or
  Rollback.
- Do not connect to a database or call DeepSeek during implementation.
- Do not retain raw Prompt, response, task arguments, reasoning, errors,
  stacks, workspace values, resource titles, IDs beyond existing bounded
  fixture identifiers, or secrets.

## Considered Approaches

### A. Add a first-class Known-ID semantic branch

Accept the canonical source union, classify Known-ID outcomes from the final
typed intent plus existing resource-readiness evidence, and adjust aggregation
only for expected safe rejections. Settle attempts from the recorder in a
`finally` block. This is the selected approach.

### B. Convert diagnostics into ordinary fixtures

This could avoid a source union, but an ordinary intent allowlist cannot
accurately represent both exact acceptance and typed safe rejection. It would
either reject valid exact references or accept unrelated failures.

### C. Reuse the legacy diagnostic runner

The older runner has a separate model path and does not traverse the production
orchestration seam. Passing it would not prove launch readiness for the
candidate Runtime.

## Architecture

### Canonical source union

`ProductionGateEvaluationInput.fixture` becomes:

```ts
L3BEvaluationFixture | L3BKnownIdDiagnostic
```

A deterministic type guard selects the semantic contract. Ordinary fixtures
continue through the current `matchesFixtureExpectation()` logic without
behavior changes.

### Known-ID outcome classification

Add a sanitized categorical outcome:

```ts
type ProductionKnownIdOutcome =
  | "exact_reference"
  | "safe_rejection"
  | "unsafe_acceptance"
  | "unrelated_failure";
```

The classifier receives only typed final intent and existing bounded role
evidence.

`accept_exact_reference` passes only when:

- the final result is one `schedule_plan` intent;
- its `planId` is a positive ID present in the actor-authorized fixture
  context;
- Full Orchestrator status is successful;
- there is no resource-readiness issue, terminal failure, or unsafe side
  effect.

`reject_invalid_reference` passes only when:

- no write intent is accepted downstream; and
- the Full result is either:
  - a deterministic Resource Readiness clarification with non-empty bounded
    `resourceIssueCodes`; or
  - typed `invalid_resource_reference` unavailability with non-empty bounded
    `resourceIssueCodes`.

Schema failure, transport failure, timeout, query-scope rejection, unrelated
clarification, or generic unavailability produces `unrelated_failure` and
fails.

The observation/report stores only the categorical outcome. It never stores the
candidate `planId`, raw task arguments, message, context, or Provider output.

### Known-ID aggregation

For the `known_id` stage only:

- `exact_reference` and `safe_rejection` can be semantic and usable successes
  when they match the canonical diagnostic expectation;
- resource counters do not count the expected resource evidence attached to a
  matching `safe_rejection`;
- `unsafe_acceptance`, an unexpected exact reference, invented/outside
  references that escape rejection, non-resource failure, side effects,
  duplicate calls, schema/transport failure, or timeout still fails the Gate.

All non-`known_id` stages retain the existing metrics and thresholds.

### Exception-safe attempt accounting

For every case, create the recorder before evaluation and settle attempts in
`finally`:

```ts
try {
  observation = await evaluateProductionGateCase(...);
} finally {
  actualProviderAttempts += providerAttemptCount(recorder.snapshot());
}
```

The budget-exceeded check runs after settlement. Successful observations are
not counted a second time. A later projection failure therefore reports the
number of attempts already started.

## Error and Safety Behavior

- A Known-ID contract mismatch becomes a normal failed observation, not an
  unhandled exception.
- Unexpected evaluator exceptions still fail closed and write no report.
- When such an exception follows a Provider request, failure output reports the
  settled recorder count.
- Expected invalid-resource rejection is diagnostic success only with typed
  resource evidence; it does not excuse schema, transport, timeout, or generic
  Provider failure.
- No invalid reference reaches task execution or persistence.
- No live report is overwritten; the fixed exclusive-path rule remains.

## Deterministic Verification

Use fake models and existing adapters to prove:

1. all six canonical Known-ID source objects can enter the production
   evaluator without a fixture-shape exception;
2. exact actor-authorized `schedule_plan` reference is
   `exact_reference`, semantic, and usable;
3. deterministic invalid-resource clarification is `safe_rejection`,
   semantic, and usable;
4. typed unsupported task-output resource rejection is `safe_rejection`,
   semantic, and usable;
5. schema/transport/unrelated failure cannot pass as safe rejection;
6. an invalid reference accepted as a write is `unsafe_acceptance` and fails;
7. expected safe rejection is excluded only from Known-ID resource
   zero-tolerance counters;
8. ordinary Acceptance/Focused/Stability metrics remain unchanged;
9. the CLI settles recorder attempts even when evaluation throws;
10. reports and observations retain no raw or resource-bearing values.

Run focused production Gate tests, typecheck, lint, `git diff --check`, and the
full Agent test suite. After an independent commit, run a clean no-network
preflight and request a new exact-HEAD Provider authorization. Do not reuse the
authorization tied to the old HEAD.

## Exit Criteria

- no Known-ID source-shape exception;
- diagnostic semantics distinguish exact acceptance, safe rejection, unsafe
  acceptance, and unrelated failure;
- failed evaluation cannot under-report started Provider attempts;
- six-case no-network preflight remains ready with the existing `6/24` ceiling;
- no Prompt, fixture, model, retry, threshold, Runtime-default, database, or
  business execution changes;
- deterministic suites pass;
- implementation is committed independently and not pushed;
- another live run occurs only after new explicit disclosure approval.
