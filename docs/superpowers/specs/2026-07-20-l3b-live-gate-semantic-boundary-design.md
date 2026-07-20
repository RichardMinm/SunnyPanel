# L3-B Live Gate Semantic Boundary Closure

Date: 2026-07-20

Status: deterministic implementation complete; live Provider gates pending

Branch: `phase/l3b-r4a-query-boundary`

Baseline: `8248c0b5e058894d90a65434d25d476dc6718760`

## 1. Purpose

Close the remaining semantic mismatch between the LangChain Authoritative
Orchestrator and SunnyPanel's executable business contracts without weakening
fixtures, safety gates, Provider thresholds, or Legacy rollback.

The change must make Provider decisions more precise while preserving the
existing deterministic validation order:

```text
structured Provider output
-> Zod schema
-> decision consistency
-> DAG validation
-> query scope provenance
-> resource readiness
-> compatibility mapping
```

The Mapper remains a pure compatibility boundary. It must not rewrite intents,
remove Provider-selected tasks, infer resources, or repair invalid decisions.

## 2. Evidence and root cause

At baseline `8248c0b`, the latest staged evidence is:

| Gate | Result |
| --- | --- |
| Targeted 15 | 15/15 semantic matches, pass |
| Acceptance 33 strict schema | 33/33 |
| Acceptance 33 Provider responses | 33/33 |
| Acceptance 33 semantic matches | 25/33 |
| Acceptance 33 usable completions | 25/33 |
| Provider failures / retries / timeouts | 0 / 0 / 0 |
| Task execution / database mutation | 0 / 0 |
| Invented resource ID / prompt injection | 0 / 0 |
| Clarify-to-write mismatch | 1 |
| Unexpected write candidate | 1 |

The eight sanitized disagreement cases form four stable classes:

| Class | Fixture IDs | Structural failure |
| --- | --- | --- |
| Consultation alias drift | `cons-1`, `cons-3`, `cons-4`, `cons-5` | `pure_consultation` selected a non-canonical consultation intent, so the Answer Renderer was not invoked |
| Untrusted query narrowing | `qry-4`, `wrt-1` | `query_plan_progress` lacked explicit-ID or exact-title provenance |
| Single/compound drift | `wrt-1`, `wrt-2` | Provider added an unrequested read or marked one task as compound |
| Unsupported runtime resource dependency | `cmp-1` | `compose_plan -> schedule_plan` required a plan ID that cannot be supplied from an earlier task output |

Schema, transport, timeout, retry, and database behavior do not explain these
failures. The root cause is that the natural-language protocol permits a
larger decision space than the downstream runtime can safely and usefully
admit. Existing deterministic checks fail closed, but only after the Provider
has produced an unusable decision.

## 3. Selected approach

Use one shared semantic-boundary contract to drive both the Orchestrator
Prompt and deterministic decision validation.

Rejected alternatives:

1. The Mapper will not normalize `explain_concept` to `answer_question`, remove
   unrequested tasks, or convert compound to single. Such rewriting would hide
   semantic errors and turn the Mapper into a second Router.
2. Fixtures and thresholds will not be relaxed to accept current Provider
   behavior. That would change the business contract instead of closing it.
3. The Answer Renderer will not be expanded to every consultation alias in
   this phase. The authoritative protocol needs one canonical consultation
   action, not a second classification layer inside answer generation.

## 4. Shared semantic contract

### 4.1 Canonical consultation

For an Authoritative Orchestrator decision:

```text
pure_consultation
-> mode=single
-> exactly one task
-> intent=answer_question
-> args.question is a non-blank copy of the user's current request
```

`answer_question` is the canonical routing action. It does not constrain the
style or substance of the later user-visible answer.

Other consultation intents remain in the Legacy compatibility schema and are
not deleted. They are not accepted for `pure_consultation` at the
Authoritative Orchestrator boundary. A schema-valid non-canonical consultation
decision is a typed decision-consistency failure; it is never silently
rewritten.

The Answer Renderer remains a separate model role. One Orchestrator call plus
one Answer Renderer call for a consultation is expected role separation, not
an unexpected duplicate call. The Orchestrator must not generate the answer
text itself.

### 4.2 Query scope provenance

The existing deterministic Query Scope contract remains authoritative:

```text
no explicit plan reference
-> query_progress
-> aggregate

explicit trusted positive planId
or explicit title deterministically resolved to exactly one trusted planId
-> query_plan_progress
-> specific
```

The shared protocol must state all of the following:

- workspace cardinality is not user selection;
- a Provider may not select a plan merely because its ID appears in context;
- title resolution is normalized, exact, and unique;
- fuzzy, partial, recent-first, or Provider-selected title matching is
  forbidden;
- zero matches, multiple matches, and ID/title conflicts require clarify;
- an untrusted specific query must not be widened to aggregate as a fallback.

The deterministic validator remains responsible for proving provenance. Prompt
text improves Provider precision but does not replace validation.

### 4.3 Explicit-goal and mode boundary

Task count is derived from explicit user goals:

- one explicit goal produces exactly one task and `mode=single`;
- two or more explicit goals may produce `mode=compound`;
- the Provider must not invent prerequisite, preparatory, verification, or
  context-loading reads that the user did not request;
- `mode=compound` requires at least two emitted tasks;
- a dependency edge does not create a new user goal;
- every compound task must correspond to an explicit requested outcome.

This preserves valid compounds such as:

```text
compose_plan -> compose_checklist
query_progress -> compose_checklist
```

It rejects a generated `query_plan_progress` that merely supports an otherwise
single `compose_plan` request.

### 4.4 Runtime-output dependency boundary

`dependsOn` expresses ordering only. Task arguments cannot refer to another
task's runtime output in this phase.

Consequently:

- `compose_plan -> compose_checklist` is supported because both tasks can
  produce independent reviewable drafts without a runtime resource ID;
- `query_progress -> compose_checklist` is supported because the dependency
  expresses workflow ordering and does not authorize an existing-resource
  mutation;
- `compose_plan -> schedule_plan` is unsupported because `schedule_plan`
  requires a trusted existing `planId` before execution;
- missing a trusted `planId` for that request yields
  `compound_missing_target`, `mode=single`, and one non-blank clarify task;
- no partial DAG or partial write candidate is returned.

This is a capability boundary, not a temporary Prompt preference. It can change
only in a later phase that introduces a typed, validated runtime-output
reference contract across Draft, Dry-run, Policy, Confirmation, and Executor.

## 5. Components and responsibilities

### Shared protocol module

`orchestrator-intent-family-protocol.ts` will publish frozen semantic rules and
the canonical consultation intent from one source. The full Orchestrator and
Residual Planner may render only the rules applicable to their capabilities.

The module owns protocol vocabulary, not fixtures or Provider-specific
examples.

### Decision consistency validator

`orchestrator-decision-consistency.ts` will enforce the canonical consultation
shape deterministically. Existing checks for mode, task count, clarify
question, read/write family, and compound shape remain fail-closed.

The validator will not parse the original user message and will not duplicate
Query Scope or Resource Guard responsibilities.

### Query scope validator

`query-scope-contract.ts` remains the only authority for explicit-ID,
exact-title, context-only selection, ambiguity, and conflict. No fuzzy
resolution or database lookup is added to the Orchestrator.

### LangChain Orchestrator prompt

`langchain-orchestrator.ts` renders the shared semantic rules together with
schema-derived field names, enum values, intent allowlists, and the existing
Resource Guard projection.

The Prompt must not contain a parallel handwritten schema or retain raw
evaluation fixtures. At most compact synthetic contrastive shapes may be used,
and their intent names must come from shared constants.

### Evaluation harness

The live harness continues to invoke the Answer Renderer only for the canonical
`answer_question` compatibility intent. Metrics remain role-specific:
Orchestrator and Answer calls, attempts, TTFT, total latency, failures, and
unexpected duplicates are reported separately.

No harness normalization is permitted. Evaluation compares the Provider's
actual schema-valid semantic projection with the unchanged fixture contract.

## 6. Error handling and safety

The repair does not create fallback adoption:

- schema failure remains typed unavailable;
- non-canonical consultation remains typed decision-consistency unavailable;
- untrusted query narrowing remains typed query-scope unavailable;
- missing or invalid existing resources remain typed resource unavailable;
- unsupported task-output dependency requires clarify;
- no failure is converted into a write candidate;
- Legacy is not invoked automatically after a LangChain failure;
- Primary, Draft, Dry-run, Policy, Confirmation, Executor, Receipt, Rollback,
  Payload schema, migrations, and LangGraph topology are unchanged.

The default Orchestrator remains Legacy until every required gate passes and a
separate configuration change is explicitly approved.

## 7. Test strategy

Implementation follows RED-GREEN-REFACTOR.

### Focused RED contracts

Tests must first demonstrate:

1. `pure_consultation + answer_question + non-blank question` is valid.
2. `pure_consultation + explain_concept` is rejected deterministically.
3. The full Prompt renders canonical consultation from the shared constant.
4. The Prompt states that context-only plan selection is forbidden.
5. A fuzzy or non-exact plan title cannot authorize
   `query_plan_progress`.
6. A single explicit write goal cannot acquire an invented query task.
7. One task cannot use `mode=compound`.
8. `compose_plan -> schedule_plan` without a pre-existing trusted `planId`
   is not an admitted new-resource dependency.
9. `compose_plan -> compose_checklist` remains an admitted compound shape.
10. `query_progress -> compose_checklist` remains an admitted compound shape.
11. The Mapper does not normalize or repair any rejected decision.
12. A canonical consultation reaches exactly one Answer Renderer logical call
    and records role-specific latency.

The sanitized regression matrix references the eight fixture IDs but does not
copy raw Provider responses or hidden reasoning into tests or reports.

### Deterministic verification

After focused GREEN, run the relevant orchestration tests first, then the
project's full deterministic baseline. No live Provider call or database
connection is part of default tests.

Any regression in safety, resource readiness, Query Scope, model-call budget,
sanitization, or Primary/Legacy defaults blocks live revalidation.

## 8. Live revalidation

Live runs are staged and stop at the first failure:

1. Targeted 15 on the same frozen targeted fixture set.
2. Acceptance 33 on the unchanged original matrix.
3. Known-ID diagnostics only after Acceptance passes.
4. Stability 99 using fresh observations only after all earlier gates pass.

Before each external stage, record:

- exact HEAD;
- fixture/config/schema/protocol hashes;
- model and base URL host;
- logical-call and Provider-attempt budgets;
- sanitized data disclosure scope;
- disconnected-database assertion.

Reports retain aggregate metrics and sanitized structural disagreement
evidence only. Raw prompts, raw responses, hidden reasoning, secrets, and
business mutations are forbidden.

The existing gate thresholds are unchanged. In particular, Acceptance must
have no clarify-to-write mismatch, unexpected write candidate, unsafe query
narrowing, invented resource, task execution, or database mutation. Stability
remains the final evidence for availability and latency.

## 9. Non-goals

This closure does not:

- change fixture expectations or Gate thresholds;
- change Provider model, temperature, timeout, retry, or output budgets;
- enable Structured Router adoption;
- switch the default Orchestrator;
- expand Query adoption;
- implement task-output references;
- modify Specialist behavior;
- change Draft, Dry-run, Policy Guard, Confirmation, Executor, Receipt, or
  Rollback;
- modify Payload schema or migrations;
- delete Legacy code;
- add dependencies;
- push the branch.

## 10. Exit criteria

The implementation is ready for live revalidation only when:

- all focused semantic-boundary tests pass;
- full deterministic suites pass;
- schema-derived and shared protocol sources remain single-source;
- the eight Acceptance disagreements are represented by deterministic
  contracts;
- default Orchestrator and Query runtime values remain Legacy/off;
- worktree changes contain no raw Provider evidence or secret;
- `git diff --check` is clean.

The Live Gate is closed only after Targeted 15, Acceptance 33, Known-ID
diagnostics, and Stability 99 all satisfy their existing frozen thresholds.
Passing focused or deterministic tests alone does not authorize adoption.
