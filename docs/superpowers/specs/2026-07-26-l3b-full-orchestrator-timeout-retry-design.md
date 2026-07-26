# L3-B Full Orchestrator Bounded Timeout Retry Design

## Status

Approved contract: the Full LangChain Orchestrator keeps its existing
30-second first-attempt timeout. If and only if that attempt ends in a genuine
Provider timeout, it may make one fresh recovery attempt with a 10-second
timeout. The complete logical call therefore has a hard upper bound of
40 seconds.

This phase is deterministic only. It does not call DeepSeek, connect to a
database, change the default runtime, or adopt LangChain decisions.

## Problem

The latest Production Seam gates passed Focused 15, Acceptance 33, and
Known-ID 6. Stability completed all 99 observations but one Full Orchestrator
request timed out after 30 seconds. That fixture passed in Acceptance and in
the first two Stability rounds, and every completed structured response was
semantically valid.

`L3B_EVALUATION_CONFIG.transportRetries` is currently `1`, but
`invokeStructured()` deliberately returns immediately on a timeout. The live
budget therefore advertises retry capacity that cannot recover this failure
class. Re-running until the sample happens to pass would hide this operational
gap.

## Decision

Add an explicit, opt-in timeout-recovery policy to `invokeStructured()`:

```ts
type StructuredTimeoutRetryPolicy = Readonly<{
  maxRetries: number;
  retryTimeoutMs: number;
}>;
```

The default is no timeout retry, preserving Router, Residual Planner, and all
other callers. The Full Orchestrator passes this policy only through its
existing structured retry budget.

The first attempt continues to use `modelConfig.timeoutMs` (`30_000` in the
Production Seam Gate). After one genuine timeout:

1. emit a sanitized `failed/timeout` attempt event with
   `retryScheduled=true`;
2. start one new Provider attempt with a 10-second timer;
3. return its successful strict-schema result normally; or
4. fail closed after any timeout, protocol, schema, transport, authorization,
   or cancellation failure on the recovery attempt.

The recovery attempt cannot schedule another schema retry or transport retry.
This ensures “one fresh attempt” is literal and the logical call cannot exceed
the approved 30+10-second window because of nested retry policies.

## Cancellation and Failure Semantics

A caller-owned abort is never a timeout retry trigger. It remains a typed,
non-retryable cancellation and stops immediately.

No partial or invalid output from the timed-out attempt is interpreted. The
recovery attempt receives the same already-built messages and strict schema;
it does not invoke Legacy and does not change the Primary decision.

Provider attempt authorization runs before the recovery request. If its
ceiling is exhausted, the existing authorization error is allowed to stop the
call before any external request.

## Call and Metric Accounting

The recovery request is:

- one additional Provider attempt;
- part of the same logical Orchestrator call;
- not a duplicate logical model call;
- visible as a timeout attempt followed by a fresh request event.

Metric denominators remain evidence-based:

- timeout rate: timed-out Provider attempts / all Provider attempts;
- transport availability: completed structured responses / structured
  Provider attempts;
- strict schema: strict-schema passes / completed structured responses;
- semantic validity: semantic passes / strict-schema passes;
- semantic match and usable result: final business observation outcomes.

Therefore a timeout followed by a valid recovery response contributes
`1/2` timeout and transport availability at the attempt level, while its final
strict schema and semantic rates remain `1/1`. A recovered observation is not
misclassified as a business semantic failure.

## Budget and Disclosure Contract

The Full Orchestrator maximum becomes:

```text
(schemaRetries + 1) * (transportRetries + 1) + timeoutRetries
```

The timeout recovery is additive, not multiplicative. The per-observation
Provider ceiling increases from 4 to 5. Evaluation config and disclosure
manifest hashes must change, so no previously approved manifest can authorize
a new live run.

Future Provider execution still requires a clean committed HEAD and a new
explicit disclosure approval. No Provider call is part of this implementation
phase.

## Deterministic Test Contract

Tests must prove:

1. `invokeStructured()` still does not retry timeouts by default;
2. the opt-in policy retries one timeout and can return a valid result;
3. the recovery attempt uses its 10-second timeout rather than the first
   attempt's 30-second timeout;
4. a recovery attempt cannot schedule schema, transport, or another timeout
   retry;
5. caller cancellation never retries;
6. Full Orchestrator exposes the policy without adding a second logical call;
7. attempt events and model-call accounting record two Provider attempts and
   one logical call;
8. final strict-schema and semantic denominators use the completed recovery
   response while timeout and availability remain attempt-based;
9. live preflight budgets and the exact disclosure manifest include the new
   maximum of five attempts per Full observation;
10. Router, Residual Planner, Answer Renderer, Legacy defaults, business
    execution, and database behavior remain unchanged.

## Non-Goals

- No Provider call or live report.
- No increase to the 30-second first-attempt timeout.
- No global automatic timeout retry.
- No retry after caller cancellation.
- No Prompt, schema, fixture, threshold, model, or Provider SDK change.
- No default Orchestrator switch or LangChain adoption.
- No Legacy deletion.
- No Draft, Dry-run, Policy Guard, Confirmation, Executor, Receipt, Rollback,
  Payload schema, migration, checkpoint, or LangGraph topology change.

## Exit Criteria

The phase is complete when the opt-in Full Orchestrator recovery contract,
attempt accounting, metric denominators, budget, and disclosure hash behavior
are covered by deterministic tests; the standard deterministic suites pass;
the worktree is clean; and the change is committed.

Only then may a new Stability 99 preflight be generated for separate user
approval.
