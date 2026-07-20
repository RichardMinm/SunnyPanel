# L3-B-R6 Contrastive Semantic Closure

Date: 2026-07-22

Status: design approved; implementation pending

Branch: `phase/l3b-r4a-query-boundary`

Implementation baseline: `d4d9f6df08d201f241a72a95609811ab143618bf`

## 1. Purpose

Close the five semantic disagreements observed in the L3-B Acceptance 33 run
without weakening the frozen fixture contract, deterministic safety pipeline,
Provider thresholds, or Legacy rollback path.

The repair is Full-Authoritative-Orchestrator-only. It adds schema-typed,
shared contrastive routing guidance so DeepSeek V4-Pro distinguishes requested
deliverables, draftable missing detail, trusted query scope, read/write
polarity, and unsupported runtime-output dependencies.

It does not make the model authoritative for facts, policy, execution, or
resource validation.

## 2. Frozen evidence

The reviewed implementation at the baseline passed its deterministic closure
and Targeted 15:

- Targeted strict schema, semantic correctness, and usability: `15/15`;
- Targeted Provider attempts: `15`, all first-attempt successes;
- Targeted timeout, retry, unsafe action, task execution, and database
  mutation: `0`.

Acceptance 33 completed all 33 schema-valid Orchestrator observations and five
canonical Answer calls, but failed the semantic Gate:

- strict schema: `33/33`;
- semantic correctness and usable completion: `28/33`;
- Provider attempts: `38/38` successful, with no timeout;
- task execution and database mutation: `0`;
- Known-ID diagnostics: not run because Acceptance failed;
- Stability 99: not run because Acceptance failed.

The five sanitized disagreement classes are:

| Fixture | Observed semantic error | Deterministic outcome |
| --- | --- | --- |
| `qry-4` | Partial title selected `query_plan_progress` | Query Scope rejected |
| `wrt-1` | One requested plan became plan plus checklist | No execution; unusable semantic result |
| `wrt-2` | Natural-language checklist draft became clarify | Safe but unusable |
| `cmp-1` | New plan plus schedule became compound and referenced an unavailable plan | Resource Guard rejected |
| `exr-3` | Imperative completion mutation became a progress read | Query Scope rejected |

These are Provider decision errors. They are not schema, transport, retry,
Mapper, database, or execution failures.

## 3. Chosen approach

Use a Full-only contrastive semantic protocol generated from frozen shared
metadata.

Rejected alternatives:

1. Do not add a second message-aware deterministic Router. Such a guard could
   reject more output but could not turn a semantically wrong result into a
   usable plan, and it would duplicate Provider classification logic.
2. Do not normalize or repair output in the Mapper. Rewriting compound to
   single, read to write, or clarify to write would hide Provider errors.
3. Do not relax fixtures, semantic accounting, thresholds, or Gate criteria.
4. Do not paste the five evaluation messages or Provider responses into the
   Prompt. Contrastive cases use neutral synthetic resources and contain no
   historical raw output or reasoning.

## 4. Semantic contracts

### 4.1 Requested deliverables define task count

A task represents a user-requested deliverable, not an internal preparation or
an optional decomposition step.

```text
one requested deliverable
-> mode=single
-> exactly one task
```

A natural-language request to create or draft a plan does not implicitly ask
for a checklist. `compose_checklist` may accompany `compose_plan` only when the
user explicitly requests both deliverables.

### 4.2 Natural-language checklist creation is draftable

When the user asks in natural language to create, prepare, or draft a task
checklist, choose `compose_checklist`.

Missing checklist items, descriptions, grouping, or dates are non-blocking
draft details. They do not justify clarify. `create_checklist` remains limited
to already complete structured data as defined by the shared intent-family
contract.

### 4.3 Specific query scope requires trusted provenance

`query_plan_progress` is permitted only when the request contains:

- an explicit positive trusted `planId`; or
- a complete plan title that deterministic normalization resolves exactly and
  uniquely to one actor-authorized plan.

A partial, fuzzy, ambiguous, or context-selected title must yield a single
clarify task. The existence of one plan in workspace context never constitutes
selection.

### 4.4 Read/write polarity follows user grammar

Status nouns and questions such as progress, completion status, whether an
item is complete, and completion percentage are reads.

Imperative requests to complete, mark complete, update, append, cancel, or
reschedule an existing resource are write candidates. If their target cannot
be trusted and uniquely resolved, they clarify. They must never be converted
into a read merely because the request contains a word related to completion.

### 4.5 Runtime-output scheduling remains unsupported

Creating a new plan and scheduling that newly created plan cannot be expressed
in the current execution contract because `schedule_plan` requires a trusted
existing `planId` before execution.

The required decision is:

```text
decisionCode=compound_missing_target
mode=single
tasks=[clarify with a non-blank question]
```

The Provider must not emit a partial DAG, `schedule_plan`, a placeholder ID,
or an invented ID. Existing supported compounds remain unchanged:

```text
compose_plan -> compose_checklist
query_progress -> compose_checklist
```

## 5. Shared protocol design

`orchestrator-intent-family-protocol.ts` will own a frozen Full-only contrast
collection and renderer. The collection is the single source for Prompt text
and Prompt-source tests.

Each contrast entry will carry only bounded protocol metadata:

- a stable case identifier;
- a neutral synthetic request class and resource description;
- the admitted `decisionCode`, `mode`, and intent sequence;
- the forbidden alternative;
- the short semantic reason.

`decisionCode` is typed by `OrchestratorDecisionCode`; mode is constrained by
`ORCHESTRATOR_MODES`; task intents are constrained by the existing
schema-derived Router intent type. No parallel Zod schema or handwritten
allowlist is introduced.

The renderer produces one marked section:

```text
[orchestrator-boundary:semantic-contrasts]
```

`langchain-orchestrator.ts` renders that section after the Full live-gate
protocol and before resource-specific rules. The Residual Planner does not
render it. The existing shared Full/Residual intent-family protocol remains
unchanged.

## 6. Runtime data flow

The production validation and mapping order remains:

```text
Provider structured output
-> strict Zod schema
-> decision consistency
-> DAG validation
-> Query Scope provenance
-> Resource Readiness Guard
-> pure compatibility Mapper
```

The contrastive protocol influences only the Provider decision. It cannot
bypass or reorder a deterministic stage. A schema-valid but wrong decision
continues to fail closed or remain a measured semantic mismatch; no fallback
Legacy execution is introduced inside the LangChain call.

## 7. Error handling and safety

The repair preserves all existing safety behavior:

- partial and fuzzy plan references clarify;
- invented or unavailable resource IDs are rejected;
- invalid task dependencies do not reach the Mapper;
- schema or Provider failure remains typed unavailable;
- no failed result is converted to a write candidate;
- no automatic Legacy fallback executes a failed LangChain decision;
- no Prompt, response, hidden reasoning, credential, or raw Provider evidence
  is retained in source or reports;
- Primary, Draft, Dry-run, Policy, Confirmation, Executor, Receipt, Rollback,
  Payload schemas, migrations, and LangGraph topology remain unchanged.

The default Orchestrator remains Legacy. Query runtime remains Legacy and Query
adoption remains off.

## 8. Deterministic test strategy

Implementation follows RED-GREEN-REFACTOR.

RED contracts must first prove:

1. Full Prompt renders every contrast from the frozen shared collection.
2. Residual Prompt excludes the contrast marker.
3. A single plan-drafting goal maps to one `compose_plan` task.
4. A natural-language checklist request maps to `compose_checklist` rather
   than clarify.
5. Partial or fuzzy plan titles cannot authorize `query_plan_progress`.
6. Imperative completion remains a write candidate and cannot become a read.
7. New-plan scheduling resolves to single clarify and cannot emit
   `schedule_plan` or a resource ID.
8. The two supported compound shapes remain admitted.
9. The Mapper does not repair any rejected or mismatched decision.
10. Full and Residual Prompt fingerprints change only where expected.
11. Runtime defaults and forbidden execution paths remain unchanged.

Tests use fake models and neutral synthetic messages. They make no Provider or
database call and store no raw Provider evidence.

After focused GREEN, run the complete deterministic baseline already required
by L3-B, including typecheck, Agent suites, planning, schedule, content, lint,
ESLint, whitespace, protected-path, default-runtime, and bounded retention
checks.

## 9. Protocol versioning

Because the Full system Prompt changes, `L3B_PROMPT_PROTOCOL_VERSION` and the
derived evaluation configuration hash must change. Tests update only the
expected Full evaluation hash.

The following remain frozen unless a deterministic test proves an unintended
change:

- original fixture snapshot;
- Residual Prompt hash;
- Residual Schema hash;
- output schema version;
- resource protocol version;
- retry, timeout, output budget, and Gate thresholds.

## 10. Staged Provider revalidation

No Provider request is part of implementation or default CI. Each live stage
requires an exact disclosure and explicit approval for the reviewed HEAD.

Stages are serial and stop at the first failure:

1. Focused 15: the five failed Acceptance fixtures, three fresh rounds.
2. Acceptance 33: the unchanged original matrix, one fresh round.
3. Known-ID diagnostics: six synthetic diagnostics, only after Acceptance
   passes.
4. Stability 99: the unchanged 33 fixtures for three fresh rounds, only after
   Acceptance and Known-ID pass.

Focused 15 and Acceptance require strict schema, normalized semantic
correctness, and usable completion of `100%`, plus zero unsafe counters,
execution, and database mutation. Every exact decision-code difference remains
reported and classified even when normalized semantics are equivalent.

The Live Gate closes only when every stage passes. Passing Focused 15 or
Acceptance alone does not authorize adoption.

## 11. Git and rollout boundary

The repair preserves the existing single implementation commit lineage by
amending `fix(agent): close live gate semantic boundaries`. No push occurs.

This phase does not:

- switch the default Orchestrator;
- enable Router or Query adoption;
- delete Legacy or compatibility code;
- enter business execution;
- create migrations, receipts, or rollback actions.

After all Gates pass, a separate reviewed configuration change is still
required before any administrative canary or default adoption.

## 12. Exit criteria

R6 implementation is ready for Focused Provider validation only when:

- all contrast metadata is typed and rendered from one source;
- Full Prompt contains the contrast marker and Residual Prompt does not;
- all eleven deterministic contract groups pass;
- the full deterministic baseline passes;
- forbidden paths and runtime defaults are unchanged;
- the worktree is clean and contains one amended implementation commit;
- review finds no unresolved Critical or Important issue.

L3-B Live Gate closes only after Focused 15, Acceptance 33, Known-ID, and
Stability 99 all pass on the same reviewed configuration fingerprint.
