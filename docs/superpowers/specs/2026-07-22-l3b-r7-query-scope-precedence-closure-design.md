# L3-B-R7 Query Scope Precedence Closure Design

**Status:** Written specification approved; deterministic implementation complete; Provider validation pending
**Date:** 2026-07-22
**Baseline HEAD:** `d0ebc72affeaa31df1f1a24071fc8703f22701fb`
**Branch:** `phase/l3b-r4a-query-boundary`

## 1. Objective

Close the remaining `qry-4` Full Orchestrator semantic disagreement without
changing the frozen query-scope product contract, fixtures, deterministic
validators, Mapper, gate thresholds, runtime defaults, or execution boundary.

The end goal remains the complete serial live sequence:

1. Focused 15;
2. Acceptance 33;
3. six conditional Known-ID diagnostics;
4. Stability 99;
5. final L3-B Live Gate audit.

This phase does not authorize adoption, default switching, Legacy removal, or
business execution.

## 2. Current evidence

The R6 Focused run used the accepted configuration fingerprint
`340e9da51a6a360a7b7d971b73e225c170f43fedf49124166e948dd2bece3962`
and completed all 15 observations:

- strict schema: `15/15`;
- Provider attempts: `15/15` successful;
- Provider timeout and retry: `0`;
- semantic correctness and usable completion: `12/15`;
- task execution and database mutation: `0`;
- invented resource, unexpected write, read-to-write escalation, duplicate
  model calls, and prompt-injection success: `0`.

All three disagreements were the same `qry-4` classification:

```text
expected: unsupported_request -> single -> clarify
actual:   pure_read_query -> single -> query_plan_progress
runtime:  invalid_query_scope / specific_reference_required
```

The other four focused fixtures passed in all three rounds. Acceptance,
Known-ID, and Stability were correctly not run.

## 3. Root-cause finding

This is not a schema, parser, transport, retry, Mapper, database, or execution
failure.

The user message attempts to identify one plan using a partial title. After the
same deterministic normalization used by Query Scope, it does not contain the
complete context title and therefore has no trusted specific-plan provenance.

The Full Prompt already contains two correct rules:

- `query_plan_progress` requires an explicit positive `planId` or an exact,
  unique full title;
- partial, fuzzy, or context-selected titles must clarify.

However, a later broad contrast still says that reading workspace state maps to
`pure_read_query`. The Provider followed that later general rule in all three
rounds. The prompt therefore leaves precedence ambiguous: it states the
specific exception but does not make that exception override the final broad
read classification or explicitly forbid aggregate fallback.

The most supported root-cause hypothesis is a rule-precedence conflict, not
insufficient prompt length.

## 4. Frozen product contract

R3-C remains authoritative:

| User reference state | Required result |
| --- | --- |
| No attempted reference to a specific plan | `pure_read_query` / `query_progress` |
| Explicit positive plan ID found in authorized context | `pure_read_query` / `query_plan_progress` |
| Full plan title exactly and uniquely resolved | `pure_read_query` / `query_plan_progress` |
| Partial, fuzzy, missing, ambiguous, or context-selected plan reference | `unsupported_request` / `clarify` |

The last row must not fall back to `query_progress`: the user attempted a
specific query, so silently widening it to aggregate scope changes the request.
Context uniqueness never proves user selection.

## 5. Considered approaches

### A. Final Query Scope precedence protocol — selected

Render one Full-only, typed, three-state decision table after all broad
read/write/compound contrasts and immediately before the final prohibition
section.

Benefits:

- addresses the observed precedence conflict directly;
- changes one semantic variable;
- preserves one Orchestrator call;
- preserves schema, deterministic validation, Mapper, and execution boundaries.

Risk: Provider compliance still depends on the prompt. A fresh Focused run is
therefore required.

### B. Deterministic scope-hint preclassifier — deferred

Compute an attempted-reference state before the Provider call and inject it as
trusted input.

This is stronger but introduces a message-aware preclassification layer and
requires defining conservative partial-title detection. It risks becoming a
second Router and is not justified until the one-variable precedence
hypothesis is tested.

### C. Semantic retry after Query Scope rejection — rejected

Retry with a sanitized Query Scope error code.

This increases latency, cost, and model calls; it hides first-pass semantic
failure and conflicts with the current one-call direction. It is not part of
R7.

## 6. Typed protocol design

Add a Full-only protocol to
`orchestrator-intent-family-protocol.ts` with a stable marker:

```text
[orchestrator-boundary:query-scope-precedence]
```

The shared metadata contains exactly three frozen cases:

1. `generic_progress_query`;
2. `trusted_specific_plan_query`;
3. `untrusted_specific_plan_attempt`.

Each case is typed with existing sources of truth:

- `OrchestratorDecisionCode` for `decisionCode`;
- `OrchestratorOutput["mode"]` for `mode`;
- `RouterIntentName` for admitted and forbidden intents.

No parallel Zod schema or handwritten enum copy is introduced.

Each case declares:

- a neutral request condition;
- the admitted `decisionCode`, `mode`, and intent;
- forbidden fallback intents;
- a concise precedence reason.

The third case must explicitly forbid both:

- `query_plan_progress`, because provenance is not trusted;
- `query_progress`, because aggregate fallback widens an attempted specific
  request.

Its only admitted shape is:

```text
unsupported_request -> single -> clarify
```

The protocol uses neutral examples and must not contain any complete message
from `L3B_EVALUATION_FIXTURES`.

## 7. Prompt ordering

`buildLangChainSystemPrompt()` keeps all existing sections and renders the new
protocol once:

```text
... existing resource rules ...
... broad read/write/compound contrast groups ...
[orchestrator-boundary:query-scope-precedence]
... final strict prohibitions ...
```

The protocol text states that it has final precedence over general read
classification whenever the user appears to reference a specific plan.

The Residual Planner must not render this marker or protocol. Its frozen Prompt
and Schema hashes remain unchanged.

## 8. Runtime boundary

The runtime order is unchanged:

```text
Provider structured output
-> strict Zod schema
-> decision consistency
-> DAG validation
-> Query Scope validation
-> Resource Readiness Guard
-> Mapper
```

R7 does not add:

- a message-aware Router or preclassifier;
- dynamic schema narrowing;
- semantic retry;
- invalid-output reinterpretation;
- Mapper normalization or repair;
- automatic Legacy fallback;
- execution, database, Receipt, or Rollback behavior.

If the Provider still selects an invalid specific read, Query Scope continues
to fail closed exactly as it does now.

## 9. Protocol fingerprint

The Full Prompt protocol version becomes:

```text
l3b-query-scope-precedence-contract-v1
```

The evaluation config hash is recomputed from the canonical evaluation config
after the prompt version changes. Tests update only the expected Full evaluation
hash. These frozen values must not change:

- fixture snapshot hash;
- Residual Prompt hash;
- Residual Schema hash.

## 10. Deterministic test contract

Tests must prove:

1. the three precedence cases are frozen and schema-typed;
2. `generic_progress_query` admits only aggregate `query_progress`;
3. `trusted_specific_plan_query` admits `query_plan_progress`;
4. `untrusted_specific_plan_attempt` admits only clarify;
5. the untrusted case forbids aggregate and specific query fallback;
6. the marker appears once in Full Prompt;
7. the marker is later than the broad workspace-read contrast;
8. the marker is earlier than final strict prohibitions;
9. Residual Prompt excludes the marker;
10. no original fixture message is copied into the protocol;
11. existing Query Scope tests still prove partial, missing, ambiguous,
    context-selected, and conflicting references fail closed;
12. exact title and explicit ID references remain valid;
13. fake runtime admits the corrected clarify shape and rejects the historical
    invalid specific-read shape;
14. Prompt version and derived Full evaluation hash are updated consistently;
15. fixture, Residual Prompt, and Residual Schema hashes remain unchanged;
16. runtime defaults and forbidden paths remain unchanged.

`tests/TEST_MAP.md` records the protected contract.

## 11. Deterministic verification

Before any Provider disclosure, run sequentially and stop at the first failure:

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run typecheck
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:agent
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:agent:planning
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:agent:schedule
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:content
npm run lint
npx eslint . --ignore-pattern '.claude/worktrees/**'
git diff --check
```

Focused orchestration tests run with `AGENT_DISABLE_LLM=1`, no database, and a
test-only Payload secret. Retention scans cover only bounded added lines and
must find no raw prompt, raw response, reasoning content, Provider secret, or
credential-shaped token.

## 12. Serial Provider gates

No Provider stage inherits authorization from an earlier HEAD.

### 12.1 Focused 15

Use the unchanged five fixtures and three fresh rounds:

```text
qry-4, wrt-1, wrt-2, cmp-1, exr-3
```

Required:

- strict schema, semantic correctness, and usable completion: `15/15`;
- `qry-4`: clarify in all three rounds;
- zero unsafe counters, Provider failure, timeout, duplicate calls, task
  execution, and database mutation.

Any failure stops the sequence. If `qry-4` fails again, do not add another
prompt patch. Stop and design the architecture-level deterministic scope-hint
approach separately.

### 12.2 Acceptance 33 and Known-ID

Only after Focused passes, run the unchanged 33 fixtures. Acceptance requires
`33/33` strict schema, normalized semantic correctness, and usable completion,
plus all frozen availability, timeout, latency, Answer, safety, and mutation
thresholds.

Only after Acceptance passes, run the six unchanged conditional Known-ID
diagnostics. They do not enter Acceptance denominators.

### 12.3 Stability 99

Only after Acceptance and Known-ID pass, run three fresh rounds of the unchanged
33 fixtures using the exact accepted config hash.

Stability must satisfy every frozen completion, transport, timeout, latency,
schema, semantic, usability, resource, Query Scope, duplicate-call, execution,
and mutation gate. A partial run or reused observation does not count.

## 13. Data handling

Reports contain only sanitized aggregate metrics, bounded protocol stages,
schema issue metadata, semantic projections, disagreement classifications, and
Known-ID outcomes.

Never retain or report:

- raw system or user prompts;
- raw Provider responses;
- hidden reasoning or `reasoning_content`;
- API keys or secrets;
- database data.

Live reports stay under absolute `/tmp` paths and are not committed.

## 14. Git and rollout boundaries

- Keep the current implementation lineage reviewable; do not push.
- Do not switch Orchestrator or Query defaults.
- Do not enable adoption.
- Do not delete Legacy, Router V2, or compatibility facades.
- Do not modify LangGraph topology, checkpointing, Draft, Dry-run, Policy,
  Confirmation, Executor, Receipt, Rollback, Payload schema, or migrations.
- A failed live gate does not require reverting a deterministic, reviewed,
  fail-closed implementation.

L3-B closes only after Stability 99 and the final requirement-by-requirement
audit pass. Default switching remains a separate, explicit phase.
