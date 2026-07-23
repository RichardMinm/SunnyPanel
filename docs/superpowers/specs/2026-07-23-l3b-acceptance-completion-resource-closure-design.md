# L3-B Acceptance Completion Resource Closure

Date: 2026-07-23

Status: design approved; implementation pending

Branch: `phase/l3b-r4a-query-boundary`

Implementation baseline: `6f62283061440815d4ff2a658fdcc316f1afbd1d`

## 1. Purpose

Close the single remaining Acceptance 33 semantic failure without changing
fixtures, Gate accounting, deterministic safety stages, Provider settings, or
runtime defaults.

The repair is limited to the Full Authoritative Orchestrator semantic contrast
for an imperative checklist-item completion request whose checklist resource
cannot be trusted and uniquely resolved.

## 2. Frozen evidence

Acceptance 33 completed all observations at the implementation baseline:

- semantic matches and usable results: `32/33`;
- structured schema validity: `29/29`;
- Answer Renderer completion: `5/5`;
- transport availability: `29/29`;
- timeouts: `0/34`;
- logical calls: `34/34`;
- Provider attempts: `34/65`;
- task execution, database access, and business mutation: `0`.

The only failed fixture was `exr-3`. Its expected result was a single clarify
decision. The schema-valid Provider decision instead selected
`explicit_write_ready -> complete_plan_item`. Resource Readiness Guard rejected
that decision with `RESOURCE_TITLE_NOT_IN_CONTEXT`, so no task reached mapping,
execution, or persistence.

The failure is not a schema, transport, Mapper, database, or execution defect.
It is an incomplete contrastive semantic contract.

## 3. Root cause

The shared `imperative_completion_mutation` contrast already declares the
admitted result:

```text
decisionCode=explicit_write_missing_resource
mode=single
intents=clarify
```

However, its forbidden alternatives cover only the previously observed read
misclassification:

```text
forbidden decisionCode=pure_read_query
forbidden intent=query_plan_progress
```

The contract does not explicitly forbid the other unsafe semantic branch:

```text
decisionCode=explicit_write_ready
intent=complete_plan_item
```

This omission lets the Provider treat a plan description as if it were a
trusted checklist reference. Resource Readiness Guard catches the error later,
but the result remains unavailable and fails Acceptance usability.

## 4. Chosen repair

Extend the existing shared `imperative_completion_mutation` contrast. It must
admit only the current clarify shape when the required checklist target is not
available, and explicitly forbid both wrong branches:

```text
forbidden decisionCodes=pure_read_query,explicit_write_ready
forbidden intents=query_plan_progress,complete_plan_item
```

The semantic reason must state all of the following:

- `complete_plan_item` operates on an existing checklist item;
- a plan title is not a checklist title;
- a plan in workspace context does not prove that a checklist exists;
- without an exact and unique checklist title in actor-authorized context, the
  Provider must select `explicit_write_missing_resource` and output one
  non-blank clarify question.

The neutral example remains fixture-independent. No raw Provider response,
reasoning, or copied evaluation message is added to source.

## 5. Rejected alternatives

1. Do not dynamically rebuild or narrow the Orchestrator Zod schema. The
   remaining defect is one incomplete semantic contrast, and a new
   context-derived schema would expand protocol and retry behavior.
2. Do not convert a Resource Guard rejection into a successful clarify result.
   That would repair an invalid Provider decision after the fact and conceal
   the unsafe candidate from Gate accounting.
3. Do not relax the `exr-3` expectation or count typed unavailable as an
   Acceptance success.
4. Do not add a deterministic natural-language Router in front of the Full
   Orchestrator.
5. Do not change temperature, retry budgets, timeout, thresholds, or Provider
   SDK integration as part of this repair.

## 6. Code and data boundaries

Allowed production change:

- `src/lib/agent/orchestration/orchestrator-intent-family-protocol.ts`

Allowed deterministic test changes:

- `tests/agent/orchestration/orchestrator-semantic-contrast-protocol.test.ts`
- only if needed to prove the unchanged fail-closed boundary,
  `tests/agent/orchestration/orchestrator-live-semantic-boundary.test.ts`

The following remain unchanged:

- `RouterOutputSchema`, Orchestrator Zod schemas, and `invokeStructured()`;
- fixtures and their expected results;
- Resource Readiness Guard and compatibility Mapper;
- Gate metrics and thresholds;
- Full/Residual Provider configuration;
- Primary/Legacy decisions and runtime defaults;
- Draft, Dry-run, Policy, Confirmation, Executor, Receipt, and Rollback;
- Payload schema, migrations, LangGraph topology, and business persistence.

## 7. Runtime behavior

The runtime order remains:

```text
Provider structured output
-> strict Zod schema
-> decision consistency
-> DAG validation
-> Query Scope provenance
-> Resource Readiness Guard
-> compatibility Mapper
```

The repair changes only the protocol instruction used before Provider
generation. Invalid output is still rejected; no deterministic stage guesses,
rewrites, or upgrades a failed result.

## 8. Deterministic verification

Implementation uses RED-GREEN-REFACTOR.

The RED test must prove that the current shared contrast is incomplete by
requiring:

- admitted decision `explicit_write_missing_resource`;
- admitted intent `clarify`;
- forbidden decision codes include `pure_read_query` and
  `explicit_write_ready`;
- forbidden intents include `query_plan_progress` and `complete_plan_item`;
- rendered Full Prompt states that a plan title cannot substitute for a
  checklist title;
- the Residual Planner still does not receive the Full-only semantic contrast.

GREEN changes only the shared contrast metadata and neutral reason text.

Focused local verification covers the semantic-contrast Prompt contract, the
Full Orchestrator boundary tests, typecheck, and whitespace validation. It
does not connect to a database or Provider.

## 9. Live revalidation

No Provider request is part of implementation.

After deterministic verification and a clean committed HEAD, prepare a new
Acceptance 33 preflight. The live rerun requires separate disclosure and
approval for the same 33 synthetic messages, synthetic workspace contexts,
updated Full/Residual rules, strict schemas, and up to five Answer Renderer
requests.

Stability 99 remains blocked until Acceptance 33 passes all existing gates.

## 10. Exit criteria

The implementation is ready for an Acceptance 33 rerun only when:

- the new RED test was observed failing for the missing forbidden branch;
- focused tests pass after the minimal metadata repair;
- `exr-3` remains expected as clarify;
- Resource Guard, Mapper, fixtures, and Gate accounting have no diff;
- runtime defaults remain unchanged;
- no Provider, database, execution, or mutation occurred;
- the worktree is clean at the resulting committed HEAD.
