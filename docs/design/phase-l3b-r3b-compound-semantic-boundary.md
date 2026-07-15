# Phase L3-B-R3-B Compound Semantic Boundary Repair

## Status

Approved Candidate A design. This phase repairs only the Orchestrator Prompt
boundary between draft-capable compound requests and mutations that require an
existing target. It preserves the R3-A metric contract, all safety Gates, and
Legacy as the default runtime.

Baseline:

- Base commit: `b8ee1a74f656114ef3eef8af13a6d4ebfde3d7ba`
- Branch: `phase/l3b-r3b-compound-semantic-boundary`
- Network-free baseline: 92 focused tests passed before the repair
- Historical evidence: cmp-3 and cmp-4 each failed their ordered compound
  contract under the R3-A accounting rules
- Default Orchestrator runtime: Legacy

## Goals

1. Correct the Prompt ordering that treats a not-yet-created downstream draft
   resource as a missing existing mutation target.
2. Preserve strict clarification when a mutation really requires an existing
   resource and the workspace cannot identify it uniquely.
3. Prove the boundary with deterministic RED/GREEN contracts before changing
   the Prompt.
4. Validate cmp-3 and cmp-4 through a staged, sanitized Provider Gate only
   after deterministic verification, a clean commit, frozen hashes, and the
   phase-specific authorization.

## Non-goals

- No schema, decision-code enum, task ID format, Resource Guard, evaluator
  accounting, fixture expectation, fixture context, Provider, model, output
  token, thinking, temperature, timeout, or retry change
- No synthetic Prompt example or schema-generated example change in the first
  round
- No production runtime adoption, default switch, Legacy removal, Router
  change, Executor call, task execution, database mutation, receipt, rollback,
  Policy Guard, Payload schema, migration, checkpoint, Planning, or Schedule
  change
- No support for passing one task's runtime output through another task's args
- No raw prompt, response, reasoning, tool arguments, secrets, workspace text,
  or resource identifiers in reports
- No acceptance-33, diagnostic-six, stability-99, or adoption Gate in R3-B

## Root cause

The current Prompt classifies target readiness before it decomposes the request
into tasks:

```text
state change
-> resource and target readiness
-> number of actions
-> decision code
-> output shape
```

It then applies two broad rules:

- any compound dependency on a resource that does not yet exist becomes
  `compound_missing_target`;
- unfinished-item requests without an exact ID also become
  `compound_missing_target`.

Those rules correctly protect mutations of existing resources, but they also
capture draft-capable compound requests. For cmp-3, the checklist is a new
draft that follows a new plan. For cmp-4, the checklist is a new draft created
from a read result. Neither operation mutates a pre-existing checklist, so the
absence of a checklist ID is not a missing-target condition.

The schema already supports ordered compound tasks through `dependsOn`. The
Resource Guard intentionally rejects runtime output references inside task
arguments. R3-B therefore changes only the classification boundary: task
ordering may express a conceptual dependency, but task arguments still may not
contain a reference to another task's runtime output and no ID may be invented.

## Considered approaches

### Candidate A: minimal boundary clarification — selected

Change the classification order and add stable boundary markers that distinguish
existing-target mutation from new-resource dependency. Keep the existing schema
example and three contrastive groups unchanged.

This is the smallest change that directly addresses the observed cmp-3/cmp-4
failure mechanism while leaving Provider configuration and safety enforcement
untouched.

### Candidate B: add cmp-3/cmp-4-like Prompt examples — rejected for round one

Examples could overfit the focused fixtures and conceal an unclear general
rule. They are not permitted in the first repair round.

### Candidate C: broader Prompt rewrite — deferred

A larger reordering or intent-family clarification is allowed only if the first
focused Provider Gate fails in a specifically permitted semantic category. It
is not part of the initial implementation.

## Prompt contract

The Prompt will expose these stable contract markers for deterministic tests:

```text
[compound-boundary:existing-target-mutation]
[compound-boundary:new-resource-dependency]
[compound-boundary:blocking-clarify]
```

The fixed decision order becomes:

1. Identify the user's requested outcomes.
2. Classify each outcome as read-only or state-changing.
3. Decompose the request into real tasks.
4. Decide whether the request is single or compound.
5. For each write task, distinguish mutation of an existing resource from
   creation of a new dependent draft.
6. Check only information that blocks safe, unambiguous drafting.
7. Clarify only when such blocking information is missing; otherwise select
   the decision code and emit its required shape.

Boundary rules:

- **Existing-target mutation:** update, append, complete, schedule, cancel, or
  delete an existing resource requires a unique trusted existing ID. If the
  workspace cannot identify it uniquely, return the corresponding missing
  decision with one non-empty clarify question.
- **New-resource dependency:** a new plan, checklist, or other draft does not
  require a pre-existing ID. When a later new task conceptually depends on an
  earlier task, emit a compound DAG and express ordering with `dependsOn`.
  Absence of an ID for the not-yet-created resource is not by itself a reason
  to clarify.
- **Blocking clarification:** ask only for information needed to identify an
  existing mutation target or to create a safe, unambiguous draft. Optional
  details may remain unresolved in a draft.
- **No runtime output reference:** `dependsOn` expresses ordering only. Task
  args must not reference another task's result, and the model must not invent
  a resource ID.

For unfinished items, a direct mutation of existing items still requires an
exact target. Organizing read results into a new draft checklist does not.

## Deterministic contract

Tests are written before the Prompt change and must prove:

1. The stable boundary markers are present in the Prompt.
2. Task decomposition and single/compound classification happen before
   existing-target readiness checks.
3. A new plan followed by a new daily checklist is compound and may use
   `compose_plan -> compose_checklist` with the second task depending on the
   first.
4. Reading current progress and drafting a new checklist is compound and may
   use `query_progress -> compose_checklist` with the second task depending on
   the first.
5. Appending to an ambiguous existing plan remains a clarify case.
6. New dependent resources are not classified as missing targets solely
   because they do not yet have IDs.
7. The schema example count, contrastive-group count, R3-A semantic Gate,
   usability Gate, resource protection, and raw-data sanitizer remain
   unchanged.
8. cmp-3/cmp-4 fixture expectations and contexts remain unchanged.

Tests use the Prompt builder and fake or deterministic inputs only. They do not
call a Provider or database.

## Provider Gate

Provider validation is conditional on all of the following:

- full deterministic verification is green;
- the implementation is committed and the worktree is clean;
- HEAD, Prompt, schema, and evaluation-config hashes are frozen;
- the user provides the exact phase authorization:
  `我授权本阶段最多使用 27 次 DeepSeek Provider 请求。`

The user's broader statement that Provider usage is unrestricted does not
override this design's hard maximum. R3-B will never exceed 27 requests.

### Focused Gate 1

Run cmp-3 and cmp-4 for three rounds each: six Provider requests total. The
Gate requires all six responses to complete, parse, pass the strict schema, be
comparable, match the exclusive semantic contract, remain usable, and retain
zero safety violations. All mismatch categories, including
`compound_to_single`, must be zero.

If the Gate fails:

- `compound_to_single` or clarify regression permits one minimal Candidate C
  ordering repair without adding examples;
- correct compound shape with wrong task intents permits one minimal
  intent-family clarification without quoting a fixture;
- protocol, schema, or Provider failure stops Prompt work;
- read-to-write or any unsafe result stops the phase.

At most one repair commit may amend the implementation lineage, followed by one
more focused six-request run. A second failure stops R3-B.

### Targeted Gate

Only after a 6/6 focused pass, run one 15-request set:
`qry-1`, `qry-2`, `cmp-3`, `cmp-4`, and `mis-2`, each for three rounds.
The Gate requires 15/15 strict, comparable, exclusive semantic matches with no
timeout, mismatch, execution, mutation, raw retention, or safety violation.

## Exit criteria

R3-B passes only when deterministic verification is green, focused validation
is 6/6, targeted validation is 15/15, all existing Gates remain unchanged,
fixtures remain unchanged, execution/database/raw-retention counters remain
zero, and Legacy remains the default. Otherwise the implementation evidence is
retained, R3-B is reported as not passed, and no adoption phase begins.
