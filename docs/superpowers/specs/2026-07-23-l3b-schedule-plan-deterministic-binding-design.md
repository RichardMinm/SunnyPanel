# L3-B Schedule-Plan Deterministic Resource Binding Design

Date: 2026-07-23

Status: approved design

Branch: `phase/l3b-r4a-query-boundary`

Implementation baseline: `47ff327998387c5d6e194a272205ea0e571d83f6`

## 1. Purpose

Close the final Known-ID business-semantic failure without weakening the
existing resource boundary or adding another model request.

For the supported single-task `schedule_plan` path, the user's one explicit,
actor-authorized plan ID becomes the authoritative resource binding. The
Provider remains responsible for selecting the intent and extracting
non-resource scheduling arguments, but it is no longer authoritative for
copying the plan ID.

## 2. Frozen live evidence

The corrected Known-ID Gate at the baseline completed all six authorized
observations:

- logical calls: `6`;
- Provider attempts: `6`;
- strict structured schema: `6/6`;
- Provider semantic validity: `6/6`;
- transport availability: `6/6`;
- timeouts: `0/6`;
- business semantic matches: `4/6`;
- usable results: `4/6`;
- latency P50: `2028ms`;
- observed upper tail: `2608ms`;
- schema repair attempts: `0`;
- task execution, database access, database mutation, and business mutation:
  `0`;
- unexpected write candidates, duplicate model calls, prompt-injection
  successes, and raw-retention violations: `0`.

The two failed exact-reference diagnostics were:

- `diag-plan-existing-id`;
- `diag-plan-title-valid-id`.

Both failures had the same bounded cause:

```text
Provider selected schedule_plan
-> Provider planId differed from the user's explicit ID
-> schedule reference validator returned provider_plan_id_mismatch
-> final business result safely clarified
```

The safety boundary worked, but two valid user requests became unusable. The
sanitized failed report is retained at:

```text
/tmp/l3b-r8-production-known-id-v3.json
```

It must not be deleted, overwritten, or reused.

## 3. Root cause

The current schedule reference contract treats equality between the
Provider-selected `task.args.planId` and the user's explicit ID as an
acceptance condition. That gives the Provider authority over a fact already
available from deterministic inputs.

This differs from the established Query Scope pattern, which deterministically
normalizes a specific plan query to the trusted ID after validating the
original message and actor-authorized Context.

The incorrect authority boundary is:

```text
user explicitly selects an authorized ID
-> Provider copies or changes the ID
-> deterministic code rejects any copy error
```

The corrected authority boundary is:

```text
user explicitly selects an authorized ID
-> deterministic code validates ID and title consistency
-> Provider selects schedule_plan and non-resource arguments
-> deterministic code binds planId to the trusted user ID
```

## 4. Product contract

This design applies only when all of these are true:

- `mode = "single"`;
- exactly one task exists;
- the task intent is `schedule_plan`;
- the original user message contains exactly one explicit positive integer
  plan ID;
- that ID exists in the actor-authorized workspace Context;
- exact authorized title evidence is absent or points to the same plan.

For that supported shape:

1. The user's explicit authorized ID is authoritative.
2. The Provider may not redirect the request to another Context resource.
3. If the Provider emits a different schema-valid `planId`, deterministic code
   replaces it with the user's ID.
4. The corrected output continues to Resource Readiness and the Mapper.
5. A bounded correction code records that a deterministic rebind occurred.

The following cases still fail closed to clarification:

- no explicit plan ID;
- more than one explicit plan ID;
- the explicit ID is not in actor-authorized Context;
- more than one exact authorized title appears;
- one exact authorized title points to a different plan than the explicit ID.

Title-only scheduling and compound scheduling remain outside this phase.

## 5. Selected architecture

Evolve the existing pure schedule reference contract from validation-only to
validation plus normalization. No new parallel parser or resolver is added.

The authoritative order remains:

```text
Provider structured output
-> strict Zod schema
-> decision consistency
-> DAG validation
-> Query Scope
-> Schedule-Plan deterministic binding
-> Resource Readiness
-> compatibility Mapper
```

The schedule binding layer consumes:

- the original user message;
- the actor-authorized `AgentPromptContext`;
- the schema-valid `OrchestratorOutput`;
- the existing shared `analyzePlanReferenceEvidence()` result.

It produces either:

- a normalized `OrchestratorOutput`, internal provenance, and zero or one
  bounded correction; or
- one existing typed clarification error.

## 6. Deterministic normalization contract

The success result adds:

```ts
export type SchedulePlanReferenceCorrectionCode =
  "provider_plan_id_rebound";

export type SchedulePlanReferenceCorrection = Readonly<{
  code: SchedulePlanReferenceCorrectionCode;
  taskId: string;
}>;
```

The valid result contains:

```ts
{
  corrections: readonly SchedulePlanReferenceCorrection[];
  output: OrchestratorOutput;
  provenances: readonly SchedulePlanReferenceProvenance[];
  valid: true;
}
```

For an accepted single-task `schedule_plan`:

1. Collect explicit IDs and exact authorized titles from the shared evidence
   analyzer.
2. Reject zero or multiple explicit IDs.
3. Reject an explicit ID absent from actor-authorized Context.
4. Reject multiple exact-title matches.
5. Reject an exact-title match pointing to a different ID.
6. Compare `task.args.planId` with the trusted explicit ID.
7. If equal, return the original output with no correction.
8. If different, return a new immutable output whose schedule task contains
   `{ ...task.args, planId: explicitPlanId }` and one
   `provider_plan_id_rebound` correction.

The Provider-selected ID is never persisted in the normalized task, passed to
Resource Readiness, mapped into business args, or retained in evaluation
evidence.

The existing `provider_plan_id_mismatch` error stops being a rejection for this
supported shape. It is replaced by the bounded success correction above.

## 7. Runtime and evidence projection

Successful Orchestrator results expose only a bounded correction code or
`null`:

```ts
schedulePlanReferenceCorrectionCode:
  | "provider_plan_id_rebound"
  | null;
```

Production Gate evidence may retain that code and aggregate a correction
count. It must not retain:

- the original or normalized plan ID;
- task IDs;
- plan titles;
- the user message;
- Provider output;
- raw prompt or response;
- reasoning, stack traces, or secrets.

A correction is not a semantic failure under the new authority contract. For
an exact-reference diagnostic, the final normalized business intent remains
`schedule_plan`, so the observation is usable and semantically matched.

The correction count is observational and non-gating. Unsafe final writes,
invalid user references, title conflicts, execution, database access, and raw
retention remain zero-tolerance failures.

## 8. Failure handling

Deterministic rebinding is allowed only after the user reference itself is
trusted. It must never repair:

- an outside or deleted plan ID;
- a missing or placeholder ID;
- multiple IDs;
- multiple exact titles;
- an ID/title conflict;
- a non-`schedule_plan` task;
- an unsupported compound task graph;
- a schema-invalid Provider completion.

All rejected cases continue to use the existing sanitized clarification
projector. No rejected or pre-normalized write task reaches Resource Readiness,
Mapper, Draft, Dry-run, Policy, Confirmation, Executor, Receipt, Rollback,
database access, or business mutation.

## 9. Evaluation and report versioning

The failed v3 report is immutable evidence. The next separately authorized
Known-ID Gate uses:

```text
/tmp/l3b-r8-production-known-id-v4.json
```

The Gate remains:

- six canonical observations;
- one round;
- at most six logical calls;
- at most 24 Provider attempts;
- database-free and execution-free;
- exclusive-create report writing;
- outside default CI.

No-network preflight must report zero Provider attempts and must not create
v4.

## 10. Deterministic tests

RED-GREEN coverage must prove:

1. A Provider ID mismatch is normalized to the one explicit authorized user
   ID.
2. Matching Provider and user IDs produce no correction.
3. Matching exact title and ID remains accepted.
4. A true title/ID conflict still clarifies.
5. Missing, multiple, outside, or placeholder IDs never rebind.
6. Multiple exact titles never rebind.
7. Title-only and compound scheduling behavior is unchanged.
8. Resource Readiness and Mapper receive only the normalized plan ID.
9. The pre-normalized Provider task is not returned or mutated in place.
10. Runtime evidence exposes only the bounded correction code.
11. Evaluation evidence contains no IDs, titles, messages, prompts, responses,
    reasoning, task IDs, or secrets.
12. Exact-reference Known-ID observations pass after deterministic rebinding.
13. An accepted unsafe write cannot be relabeled as a safe rejection.
14. The six diagnostic IDs, order, one-round contract, and 6/24 budgets remain
    unchanged.
15. The report path is v4, v3 metadata remains unchanged, and preflight creates
    no report.
16. Query Scope, Resource Readiness, default Legacy behavior, and all existing
    safety contracts remain unchanged.

## 11. Non-goals

- No Prompt or contrastive-example change.
- No structured schema, `SchedulePlanArgs`, Payload schema, or migration
  change.
- No Provider configuration, timeout, retry, output budget, or threshold
  change.
- No additional model call.
- No Query allowlist or compound scheduling expansion.
- No LangGraph topology or checkpoint change.
- No Draft, Dry-run, Policy, Confirmation, Executor, Receipt, or Rollback
  change.
- No database access or business mutation.
- No Legacy removal or default-runtime switch.
- No automatic Provider Gate after deterministic verification.

## 12. Exit criteria

Before requesting another live authorization:

- focused schedule binding and Orchestrator tests pass;
- production evaluation and Gate contract tests pass;
- complete deterministic Agent tests pass;
- typecheck, lint, and whitespace checks pass;
- runtime defaults remain unchanged;
- the implementation is independently committed;
- the worktree is clean;
- v1, v2, and v3 report metadata is preserved;
- v4 does not exist;
- implementation Provider attempts remain `0`;
- no prohibited subsystem changed.

Only then may the user separately approve the corrected six-observation
Known-ID Gate on the exact final HEAD. LangChain remains blocked until that
Gate passes.
