# L3-B Schedule-Plan Reference Provenance Design

Date: 2026-07-23

Status: approved design direction; written specification pending user review

Branch: `phase/l3b-r4a-query-boundary`

Implementation baseline: `ca9cd042f1b75d9ae34cf73756c9e19e838d53a9`

## 1. Purpose

Close the remaining Known-ID production-semantic gap without adding another
model call, expanding the business payload, or relying on stronger Prompt
wording.

The change adds a deterministic reference-provenance boundary for the current
single-task `schedule_plan` path. It validates the Provider-selected `planId`
against the original user message and the actor-authorized workspace context
before Resource Readiness, Mapper, Draft, Dry-run, Policy, Confirmation, or
execution can observe the candidate.

## 2. Frozen live evidence

The Known-ID Gate at the baseline completed all six authorized observations:

- logical calls: `6`;
- Provider attempts: `6`;
- strict structured schema: `6/6`;
- Provider semantic validity: `6/6`;
- transport availability: `6/6`;
- timeouts: `0/6`;
- business semantic matches: `5/6`;
- usable results: `5/6`;
- latency P50: `2091ms`;
- observed upper tail: `2383ms`;
- task execution, database access, database mutation, and business mutation:
  `0`;
- unexpected duplicate model calls: `0`;
- raw-retention violations: `0`.

Five diagnostics behaved as intended. The only failing observation was
`diag-plan-title-conflicting-id`, whose message was:

```text
把另一个计划 101 安排到下周
```

The Provider returned:

```text
explicit_write_ready -> single -> schedule_plan(planId=101)
```

The production boundary accepted the write candidate. The Gate correctly
classified it as `unsafe_acceptance` under the fixture's then-current
expectation.

The failed sanitized report remains retained at:

```text
/tmp/l3b-r8-production-known-id-v2.json
```

It must not be overwritten or deleted by this phase.

## 3. Root cause

`SchedulePlanArgs` contains `planId` and optional scheduling details, but no
`planTitle`. The strict Orchestrator schema therefore cannot carry a title
claim into the existing Resource Readiness Guard.

The Guard contains a title-conflict branch, but that branch reads
`task.args.planTitle`. For a strict `schedule_plan` task this field is
unreachable. Once the Provider returns an actor-authorized `planId`, the Guard
can confirm only that the ID exists; it cannot compare the original message's
title evidence.

This is a cross-layer provenance gap:

```text
original message title evidence
  -> available before Provider invocation
  -> absent from strict schedule_plan args
  -> unavailable to Resource Readiness
```

Prompt-only repair cannot make this deterministic. Adding `planTitle` to the
business args would expand multiple downstream contracts and would still
depend on the Provider copying the title faithfully.

## 4. Product reference contract

For the currently supported single-task `schedule_plan` path, resource
authority follows this precedence:

1. The user must explicitly provide exactly one positive integer plan ID.
2. The Provider output must copy that exact ID.
3. The ID must exist in the actor-authorized workspace context.
4. Exact full plan titles present in both the message and the authorized
   context are secondary consistency evidence.
5. When exactly one authorized exact title is mentioned, its plan ID must
   equal the explicit ID.
6. Multiple explicit IDs, multiple exact authorized titles, an outside ID, a
   placeholder, a Provider-selected different ID, or an ID/title conflict
   must fail closed to a typed clarification.

Generic words such as `计划`, `另一个计划`, or `这个计划` are not plan titles.
When the message also contains one valid explicit ID, these words do not
override or conflict with the ID. This means:

```text
把另一个计划 101 安排到下周
```

is treated as an explicit-ID reference, not as a title conflict. This decision
is locked by a deterministic regression test.

An exact title counts only when it exactly matches an actor-authorized context
title after the existing title normalization rules. No fuzzy matching,
substring-first selection, Context-unique inference, or Provider-selected
workspace resource is allowed.

Title-only scheduling remains outside this closure phase. It continues to
clarify when no explicit trusted plan ID is available.

## 5. Selected architecture

Add one pure module:

```text
schedule-plan-reference-contract.ts
```

Its public operation is conceptually:

```ts
validateSchedulePlanReferences({
  context,
  message,
  output,
}): SchedulePlanReferenceValidationResult
```

The authoritative order becomes:

```text
Provider structured output
-> strict Zod schema
-> decision consistency
-> DAG validation
-> Query Scope provenance
-> Schedule-Plan Reference provenance
-> Resource Readiness Guard
-> compatibility Mapper
-> existing downstream workflow
```

The new validator does not route intents, call a model, query a database,
repair Provider output, or add fields to `SchedulePlanArgs`. It authorizes or
rejects only an already-schema-valid `schedule_plan` reference.

## 6. Internal provenance contract

Accepted references produce internal-only metadata:

```ts
type SchedulePlanReferenceProvenance =
  | {
      source: "explicit_plan_id";
      planId: number;
      taskId: string;
    }
  | {
      source: "explicit_plan_id_and_exact_title";
      planId: number;
      taskId: string;
    };
```

The metadata:

- is derived by deterministic code;
- is never supplied by the Provider;
- is not added to `SchedulePlanArgs`;
- is not passed to Executor, Receipt, Rollback, or database persistence;
- may be retained in runtime state only where needed to prove the reference
  boundary;
- is projected to evaluation reports only as a bounded source label, never as
  a plan ID, title, raw message, or workspace value.

Rejected references return one of these bounded codes:

```ts
type SchedulePlanReferenceErrorCode =
  | "explicit_plan_id_required"
  | "multiple_explicit_plan_ids"
  | "provider_plan_id_mismatch"
  | "explicit_plan_id_not_in_context"
  | "multiple_exact_plan_titles"
  | "plan_id_title_conflict";
```

New codes do not become projectable automatically.

## 7. Deterministic extraction rules

The implementation must share the existing positive-ID and normalized-title
rules currently used by Query Scope. It must not introduce a parallel fuzzy
resolver.

For every schema-valid output:

1. If there is no `schedule_plan` task, return the output unchanged with no
   schedule provenance.
2. If the output contains a supported single `schedule_plan` task, collect
   explicit plan IDs from the original message.
3. Require exactly one explicit ID.
4. Require `task.args.planId` to equal that ID.
5. Require the ID to be present in the authorized Context.
6. Collect Context plans whose complete normalized titles appear in the
   normalized message.
7. Accept zero exact-title matches as `explicit_plan_id`.
8. Accept one exact-title match only when it resolves to the same ID, recording
   `explicit_plan_id_and_exact_title`.
9. Reject more than one exact-title match as ambiguous.
10. Reject a single exact-title match that resolves to another ID as
    `plan_id_title_conflict`.

Unsupported compound scheduling shapes retain their current deterministic
behavior. This phase does not make `compose_plan -> schedule_plan` executable.

## 8. Failure projection and safety

Every schedule-reference rejection is user-correctable and must project to one
deterministic, valid clarification:

```text
mode=single
taskCount=1
intent=clarify
dependsOn=[]
```

The clarification asks the user to confirm one exact existing plan ID. It must
not echo Provider text, hidden reasoning, workspace titles, or rejected IDs.

The result is a typed `clarified` Orchestrator result, not Provider semantic
success and not a repaired `schedule_plan` candidate. Sanitized evidence keeps:

- the Provider decision projection;
- the schedule-reference error code;
- the final business `clarify`;
- the bounded rejection source
  `schedule_plan_reference_contract`.

The rejected write candidate must never reach Resource Readiness, Mapper,
Draft, Dry-run, Policy, Confirmation, Executor, Receipt, Rollback, task
execution, database access, or business mutation.

## 9. Diagnostic correction

The previous message `把另一个计划 101 安排到下周` does not contain a concrete
plan title. Treating `另一个计划` as if it were a title made the diagnostic name
and expectation stronger than the actual data.

The next deterministic implementation must:

1. retain that sentence as a regression test for accepted explicit-ID
   provenance;
2. replace the sixth live diagnostic's message and Context with a genuine
   exact-title conflict;
3. retain the same six-observation Known-ID stage size and ordering.

The genuine conflict uses two authorized plans:

```text
101 = 考研数学复习计划
102 = 英语复习计划
```

and the request:

```text
把英语复习计划 101 安排到下周
```

The Provider may return either a correct clarification or the unsafe
`schedule_plan(planId=101)` candidate. In the latter case the deterministic
reference contract must intercept it and the final business result must still
be a usable clarification.

This is not an evaluator-only exemption. The same validator runs in the
production Orchestrator seam, and the old failed report remains immutable
evidence of the previous contract.

Changing the diagnostic message and Context changes the fixture snapshot and
external disclosure. A future live Gate requires a new exact-HEAD approval
that explicitly discloses the corrected synthetic conflict data.

## 10. Evaluation accounting

Known-ID observations add bounded schedule-reference evidence:

```ts
schedulePlanReferenceErrorCode:
  | SchedulePlanReferenceErrorCode
  | null;

knownIdRejectionSource:
  | "provider_missing_resource"
  | "resource_readiness_guard"
  | "schedule_plan_reference_contract"
  | null;
```

For deterministic schedule-reference clarification:

- final `semanticMatch` and `usable` are true only for a diagnostic that
  expects rejection;
- the original Provider write candidate remains visible as a sanitized
  deviation;
- `unexpectedWriteCandidates` uses the final business plan and remains zero;
- a dedicated non-gating Provider-deviation counter may increment;
- database, execution, mutation, duplicate-call, and raw-retention counters
  remain zero.

An exact-reference diagnostic cannot pass through clarification. A
reject-invalid-reference diagnostic cannot pass through an accepted write
candidate.

The next report path must be versioned and unused:

```text
/tmp/l3b-r8-production-known-id-v3.json
```

The v1 and v2 reports remain untouched.

## 11. Deterministic tests

Implementation follows RED-GREEN-REFACTOR and must prove:

1. ID-only `schedule_plan` with an explicit authorized ID is accepted.
2. `另一个计划 101` is accepted as ID-only provenance.
3. An exact matching title plus ID is accepted.
4. A genuine exact title/ID conflict becomes one deterministic clarification.
5. Multiple explicit IDs clarify.
6. Multiple exact authorized titles clarify.
7. An outside ID clarifies.
8. A placeholder or missing ID clarifies.
9. A Provider-selected ID different from the user's ID clarifies.
10. A Context ID not explicitly selected by the user clarifies.
11. The rejected write cannot reach Resource Readiness, Mapper, Draft,
    Dry-run, Policy, Confirmation, or execution.
12. Provenance is internal and never appears in business args.
13. Reports retain only bounded source/error labels, not messages, titles,
    resource IDs, prompts, responses, reasoning, or secrets.
14. Existing Query Scope behavior remains unchanged.
15. Existing Resource Readiness behavior remains unchanged.
16. The six Known-ID diagnostics remain canonical, ordered, and exclusive.
17. The corrected conflict fixture cannot be accepted as an exact reference.
18. Default Orchestrator and all Legacy fallbacks remain unchanged.

Update `tests/TEST_MAP.md` with the new contract.

## 12. Non-goals

- No Prompt or contrastive-example change.
- No `SchedulePlanArgs`, Payload schema, or migration change.
- No Query allowlist expansion.
- No compound scheduling support.
- No Draft, Dry-run, Policy, Confirmation, Executor, Receipt, or Rollback
  change.
- No LangGraph topology or checkpoint change.
- No Provider configuration, timeout, retry, or Gate-threshold change.
- No Legacy removal or default-runtime switch.
- No Provider call or database connection during implementation.
- No automatic second Gate after deterministic verification.

## 13. Verification and exit criteria

Before a new live authorization request:

- focused schedule-reference RED/GREEN tests pass;
- Orchestrator, Resource Readiness, Known-ID evaluator, and Gate contract tests
  pass;
- full Agent deterministic suites pass;
- typecheck, lint, and `git diff --check` pass;
- no Prompt, business args, database schema, Provider config, retry, threshold,
  or runtime-default change is present;
- the implementation is committed independently;
- the worktree is clean;
- `/tmp/l3b-r8-production-known-id-v3.json` does not exist;
- old v1 and v2 reports remain mode `0600`;
- Provider attempts during implementation remain `0`.

Only then may the user separately approve the corrected six-observation
Known-ID Gate on the exact final HEAD, with no more than six logical calls and
24 Provider attempts.

The phase passes only when all six final business outcomes are correct,
strict-schema and transport completion are complete, unsafe acceptance is
zero, and every execution/database/business-mutation counter remains zero.
