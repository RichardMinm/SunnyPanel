# L3-B-R3-C Orchestrator Query Scope Semantics

Date: 2026-07-16

Status: read-only audit complete; normative decision recorded; production
conformance remains blocked

Baseline: `e374d63a506e346946e187e36f053124b779e564`

Branch: `phase/l3b-r3c-query-scope-audit`

Final audit verdict: `MIXED_QUERY_SCOPE_CONTRACT`

## 1. Status and scope

This specification audits and decides the semantic boundary between
`query_progress` and `query_plan_progress`. It does not change the Orchestrator
Prompt, schema, validators, resource guard, mapper, Query Runtime, QueryFacts,
fixtures, evaluator, runtime flags, or production behavior.

The normative product decision is:

```text
no explicit plan reference
-> query_progress
-> aggregate scope

explicit trusted positive planId
or explicit title deterministically resolved to exactly one trusted planId
-> query_plan_progress
-> specific scope
```

Workspace cardinality is not a user selection. A Provider may copy a trusted,
already-resolved reference, but it may not create a resource selection from
workspace context. Zero or multiple deterministic title matches require
clarification. An ID/title conflict requires clarification or a typed resource
conflict; it must not fall back to aggregate scope.

This decision closes the target semantics at specification level. The current
codebase does not enforce the decision consistently, so production Query Scope
conformance is not closed and no Orchestrator adoption is authorized.

## 2. Current failure evidence

The approved, sanitized R3-B-R3-B focused evidence records:

| Gate | Result |
| --- | --- |
| Deterministic focused tests | 78/78 |
| Focused Gate 1 | 0/6 exclusive semantic matches |
| Focused Gate 2 | 3/6 exclusive semantic matches |
| First compound fixture in Gate 2 | 3/3 matches |
| `cmp-4` in Gate 2 | 0/3 matches |
| Targeted 15 | not run |

All three second-gate `cmp-4` observations had a valid compound shape and the
expected draft task, but selected specific-plan progress instead of aggregate
progress. No raw message, title, identifier, Prompt, response, or reasoning is
retained in this specification.

This phase made zero Provider calls and did not connect to a database.

## 3. Production intent contracts

### 3.1 Contract table

| Field | `query_progress` | `query_plan_progress` |
| --- | --- | --- |
| User semantics | Overall or category-level workspace progress | Progress of one explicitly selected plan |
| Request scope | Aggregate | Specific |
| Required arguments in the TypeScript type | None | None in the legacy union; this is too permissive for the normative contract |
| Optional typed arguments | `scope`, `checklistTitle` | `planId`, `planTitle` |
| Normative execution argument | `scope` absent or `all`, `plans`, `checklists` | One trusted positive integer `planId`, with no unresolved title alias |
| Requires `planId` | No | Yes at the admitted Query Runtime boundary |
| Allows title | Legacy loader accepts it; aggregate title means checklist filtering, not plan selection | Only as input to a deterministic exact-and-unique resolver; not as the final runtime reference |
| Resource resolution | None for aggregate variants | Required before admitted specific execution unless an explicit trusted ID already exists |
| Reads one resource | No | Yes |
| Reads aggregate data | Yes | No |
| QueryFacts variant | `AggregateProgressFacts` / `aggregate_progress` | `PlanProgressFacts` / `plan_progress` |
| Repository query | Up to 100 plans and 100 checklists, then deterministic aggregation | `findByID` for ID; legacy title path scans the most recent ten plans and takes the first fuzzy substring match |
| Visibility behavior today | Repository uses `overrideAccess: true` and no visibility predicate | Repository uses `overrideAccess: true` and no visibility predicate |
| Archived behavior today | No status predicate; archived records can participate in aggregate results | No status predicate; an archived plan can be returned by ID/title lookup |
| Deleted behavior today | Deleted records are absent from aggregate results | The default `findByID` call omits `disableErrors: true`, so a missing/deleted ID can throw instead of returning `null`; injected tests cover the `null`/clarify branch only |
| Current Query Runtime eligibility | Exact aggregate shapes only | Exactly one positive integer `planId`; title-only, empty, mixed ID/title, and extra args are rejected |
| Current default handling | Query Runtime defaults to Legacy and adoption defaults off | Query Runtime defaults to Legacy and adoption defaults off |
| Business writes | None | None; tool-registry `execute` is a read dispatch despite legacy write-intent taxonomy |

### 3.2 Authoritative evidence

The current contract is distributed across these production seams:

- `src/lib/agent/schemas.ts` defines optional `QueryProgressArgs` and
  `QueryPlanProgressArgs` fields and normalizes `query_progress` to aggregate
  scope. It does not currently parse `query_plan_progress` in
  `parseAgentIntentResult()`.
- `src/lib/agent/query/intent-scope.ts` and
  `src/lib/agent/query/admin-adoption.ts` admit only exact aggregate variants
  and positive-ID specific variants.
- `src/lib/agent/query/facts-repository.ts` provides the request-time data
  reads. Its title branch is deliberately preserved by tests as a legacy
  recent-ten, fuzzy-first behavior; it is not an exact unique resolver.
- `src/lib/agent/query/facts.ts` computes aggregate counts and projects the
  single-plan facts. The Provider does not choose or calculate these facts.
- `src/lib/agent/query/dispatcher.ts` rejects non-admitted shapes before the
  new fact loader. It produces deterministic clarification when the loader
  returns `null`, but the default Payload `findByID` call can throw on a missing
  document because errors are not disabled.
- `src/lib/agent/progress.ts` and `src/lib/agent/tools/query-tools.ts` format
  the aggregate and specific results without business writes.
- `src/lib/agent/query/runtime-config.ts` and
  `src/lib/agent/orchestration/runtime-config.ts` keep Query adoption off and
  the Orchestrator on Legacy by default.

### 3.3 Visibility, archived, deletion, and freshness constraints

The Query Scope decision is separate from record-inclusion policy, but the
current inclusion behavior affects whether workspace context can be used as a
selector:

1. The Plan collection is readable only by an authenticated admin. The
   guarded Query adoption path also requires the server-derived admin actor.
2. QueryFacts repositories use `overrideAccess: true`; authorization therefore
   relies on the preceding trusted-actor gate rather than a repository-level
   request user.
3. Aggregate and specific QueryFacts loaders do not filter Plan `status` or
   `visibility`. Archived and public/private records can be read by the
   current single-admin path.
4. Workspace Prompt context loads private plans, ranks and truncates them, and
   the LangChain Prompt exposes at most eight. A context containing one plan
   does not prove that the database contains one accessible plan.
5. QueryFacts are loaded at request time after intent selection. Workspace
   context was loaded earlier in the turn and may be filtered, truncated, or
   stale relative to that read.
6. A deleted or missing specific plan is absent from the accessible resource
   universe. The normative result is clarification without widening to
   aggregate scope. Current production code does not fully satisfy this rule:
   Payload `findByID` defaults to throwing when `disableErrors` is false, while
   deterministic injected-dependency tests exercise a `null` result.

These facts make context cardinality an unsafe proxy for explicit selection.
They do not authorize a record-policy change in this phase.

## 4. Resource reference sources

The status column describes the normative trust class. The current-support
column records whether the repository has a complete deterministic path today.

| Reference source | Status | Current support and constraint |
| --- | --- | --- |
| Explicit positive `planId` | `TRUSTED_EXPLICIT` | The admitted Query Runtime accepts a positive integer and attempts to verify existence by loading facts. It does not currently prove context membership; under the current single-admin model, the actor gate is the access boundary. Missing IDs can throw instead of reaching the intended `null`/clarify branch. |
| Explicit title resolved by exact normalization to one accessible plan | `TRUSTED_RESOLVED` | Target contract only. No conforming resolver exists today; the legacy fuzzy-first loader is insufficient. |
| Validated upstream typed reference carrying selection provenance and positive ID | `TRUSTED_RESOLVED` | Admissible in the target contract. Current `AgentIntent` carries the ID but no provenance marker, so a Provider-created ID cannot be distinguished deterministically. |
| Conversation/session selected resource | `SUPPORTED_BUT_NOT_QUERY_SCOPE` | Session state may describe a current target, but no production Query Scope resolver currently converts it into a trusted query selection. It must not be assumed. |
| Workspace contains exactly one projected plan | `UNSUPPORTED` | Projection cardinality may result from visibility, ranking, truncation, loading policy, or staleness and is not user intent. |
| Provider selects or copies an unselected workspace resource | `UNSUPPORTED` | The Provider cannot create selection authority. A syntactically valid context ID is not a trusted explicit reference. |
| Unresolved title text | `AMBIGUOUS` | Until deterministic resolution returns exactly one accessible positive ID, the title cannot authorize `query_plan_progress`. |

An explicit positive ID is sufficient for `query_plan_progress` only after the
specific repository read confirms that the record exists within the trusted
actor's allowed resource universe. A future multi-user or owner-scoped model
must replace the current admin boundary with request-scoped authorization; the
present `overrideAccess` behavior is not a general RBAC contract.

## 5. Aggregate versus specific scope

### 5.1 Aggregate expressions

Generic expressions about project, workspace, current, plan, or overall
progress select `query_progress` when they do not explicitly identify one
plan. Possessive language such as “my plans” remains aggregate. The number of
plans in context does not affect the decision.

### 5.2 Specific ID expressions

An explicit trusted positive plan ID selects `query_plan_progress`. The ID is
copied without replacement or inference. A nonexistent or inaccessible ID
produces clarification, never aggregate fallback.

### 5.3 Specific title expressions

An explicit plan title may select `query_plan_progress` only through this
deterministic protocol:

1. normalize Unicode and whitespace according to one shared function;
2. perform an exact normalized-title lookup inside the actor's accessible
   resource universe;
3. accept exactly one match;
4. return its positive `planId` as a typed resolved reference;
5. discard the title alias before Query Runtime eligibility and execution.

Zero matches and multiple matches produce clarification. Substring, recency,
Provider preference, and first-result selection are forbidden.

The existing `loadPlanProgressFacts({ planTitle })` behavior fails steps 2 and
3. It is legacy compatibility, not a trusted resolver, and remains outside the
admitted Query Runtime.

### 5.4 Context uniqueness

Context uniqueness is not explicit user selection. This rule is invariant
under context filtering, budget changes, workspace ordering, visibility,
archival, and Provider behavior.

```text
generic progress request + one context plan
-> query_progress
```

### 5.5 ID/title conflict

When an explicit trusted ID and explicit title resolve to different plans, the
result is `clarify` or a typed resource-conflict failure. The implementation
must not prefer the ID silently, prefer the title silently, call the Provider
to decide, or widen the request to aggregate scope.

The current legacy fact loader prefers `planId` whenever both fields exist and
does not compare the title. That behavior is contradictory to the normative
contract.

## 6. Query Scope Decision Table

| User expression | Trusted resource state | Intent | Final arguments | Required behavior |
| --- | --- | --- | --- | --- |
| Generic project/current progress | No explicit selection | `query_progress` | aggregate scope | Context plan count has no effect |
| Overall plan completion | Any context state | `query_progress` | aggregate scope | Read workspace aggregate facts |
| Explicit positive plan ID | Existing and accessible | `query_plan_progress` | original positive `planId` | Provider cannot replace it |
| Explicit positive plan ID | Missing or inaccessible | `clarify` | non-empty question | Do not widen to aggregate |
| Explicit plan title | Exactly one deterministic exact match | `query_plan_progress` | resolved positive `planId` | Title is not the final execution reference |
| Explicit plan title | Zero deterministic matches | `clarify` | non-empty question | Do not guess |
| Explicit plan title | Multiple deterministic matches | `clarify` | non-empty question | Ask user to select |
| No explicit plan | Context projects one plan | `query_progress` | aggregate scope | Context uniqueness is not explicit selection |
| Explicit title and ID | Same accessible plan | `query_plan_progress` | trusted positive `planId` | Resolution must prove agreement |
| Explicit title and ID | Different plans | `clarify` / typed conflict | non-empty question or safe typed failure | Do not ignore conflict |
| Provider selects a context resource | No explicit or resolved selection | reject as semantic mismatch | none | Provider cannot create selection authority |

## 7. `cmp-4` audit

Only sanitized structural evidence is recorded:

```text
fixture_id = cmp-4
category = compound
explicit_plan_reference_present = false
context_positive_plan_id_present = true
trusted_explicit_plan_id_present = false
context_plan_count = 1
expected_query_scope = aggregate
expected_mode = compound
expected_task_order = query_progress -> compose_checklist
focused_gate_2_actual_query_scope = specific (3/3)
focused_gate_2_actual_task_order = query_plan_progress -> compose_checklist (3/3)
```

Findings:

1. The user expression does not identify a concrete plan by ID or title.
2. The fixture builder projects one plan and its syntactically positive ID into
   untrusted workspace context. It does not inject that ID into the user
   expression, expected task arguments, or a trusted selected-resource field.
3. `buildWorkspaceContext()` exposes the projected ID to the Provider, but no
   deterministic Query Scope resolver authorizes it as user selection.
4. The only observable candidate selector is the single projected context
   plan. Hidden Provider causation cannot and need not be inferred; the output
   itself performs an unauthorized implicit narrowing.
5. The compound evaluator treats expected intents as an exact ordered
   contract. `query_plan_progress -> compose_checklist` therefore remains an
   `intent_mismatch` against `query_progress -> compose_checklist`.
6. The expectation is consistent with the normative aggregate-by-default
   decision and must remain unchanged during contract alignment.

Fixture verdict: retain the current expectation and the mismatch. Do not
migrate the fixture to accept implicit context selection.

## 8. Cross-module consistency matrix

The matrix compares current code with the normative decision in this
specification. `UNDEFINED` means that the module neither proves nor rejects the
selection rule. `CONTRADICTORY` means that current behavior can select or
execute a different scope.

| Module | Generic progress | Explicit plan ID | Explicit title | Context-only unique plan | ID/title conflict |
| --- | --- | --- | --- | --- | --- |
| LangChain Orchestrator Prompt | `CONSISTENT` | `CONSISTENT` | `UNDEFINED` | `UNDEFINED` | `UNDEFINED` |
| Orchestrator schema / intent metadata | `CONSISTENT` | `CONSISTENT` | `CONSISTENT` | `UNDEFINED` | `UNDEFINED` |
| Decision consistency validator | `UNDEFINED` | `UNDEFINED` | `UNDEFINED` | `UNDEFINED` | `UNDEFINED` |
| Compatibility mapper | `UNDEFINED` | `UNDEFINED` | `UNDEFINED` | `CONTRADICTORY` | `UNDEFINED` |
| Query intent metadata and legacy tools | `CONSISTENT` | `CONTRADICTORY` | `CONTRADICTORY` | `UNDEFINED` | `UNDEFINED` |
| QueryFacts repository | `CONSISTENT` | `CONSISTENT` | `CONTRADICTORY` | `NOT_APPLICABLE` | `CONTRADICTORY` |
| Query Runtime scope/adoption gate | `CONSISTENT` | `CONSISTENT` | `CONSISTENT` | `CONSISTENT` | `CONSISTENT` |
| Resource Readiness Guard | `NOT_APPLICABLE` | `UNDEFINED` | `UNDEFINED` | `UNDEFINED` | `UNDEFINED` |
| Evaluation harness comparator | `CONSISTENT` | `UNDEFINED` | `UNDEFINED` | `CONSISTENT` | `UNDEFINED` |
| 33-fixture expectations | `CONTRADICTORY` | `UNDEFINED` | `CONSISTENT` | `CONTRADICTORY` | `UNDEFINED` |
| Query focused tests | `CONSISTENT` | `CONSISTENT` | `CONSISTENT` | `NOT_APPLICABLE` | `CONSISTENT` |

### 8.1 Matrix evidence

- The LangChain Prompt says global/general progress uses `query_progress` and
  one explicitly and uniquely identified plan uses `query_plan_progress`. It
  does not define exact title resolution, context cardinality, or query
  conflict behavior.
- The Orchestrator task schema validates `args` only as a generic record. It
  does not apply intent-specific Query Scope invariants.
- The decision consistency validator classifies both intents as valid reads
  but does not inspect their arguments or selection provenance.
- The mapper copies Provider tasks and arguments without interpretation. A
  Provider-selected context ID therefore survives mapping.
- `QueryPlanProgressArgs` makes ID and title optional. The OpenAI function-tool
  metadata historically requires `planTitle`, while the admitted Query Runtime
  requires `planId`. `query_plan_progress` also appears in a legacy
  write-intent type/list even though its registry capability and execution are
  read-only.
- The specialized Query Agent Prompt allows `planId` or a plan title that the
  model can uniquely match from context, but the downstream legacy loader is
  fuzzy-first and no exact unique resolver proves that selection.
- `parseAgentIntentResult()` handles `query_progress` but lacks a
  `query_plan_progress` branch. A single-task compatibility projection can
  therefore fail to create a pre-resolved specific query even though the
  schema and registry advertise the intent.
- The repository's title path is fuzzy-first and its mixed ID/title path
  silently prefers ID.
- The Resource Guard defines existing-ID requirements only for selected write
  intents. It does not validate a `query_plan_progress` ID, title, provenance,
  or conflict.
- The compound harness compares exact ordered intent lists. That comparison is
  correct for `cmp-4`, but other single fixtures accept aggregate and specific
  progress as alternatives for generalized expressions. The fixture set is
  therefore not a single scope contract.
- Focused Query Runtime tests correctly lock exact aggregate shapes and the
  positive-ID specific shape, reject title-only and mixed-ID/title shapes, and
  preserve Legacy fallback for excluded variants.

## 9. Why the final verdict is mixed

No repository evidence establishes this alternative product rule:

```text
workspace projects one plan
-> user selected that plan
-> query_plan_progress
```

The `cmp-4` expectation is therefore not disproved. However, current modules
do not share one enforceable contract:

1. the Prompt states a broad aggregate/specific distinction but omits the
   deterministic selection protocol;
2. the schema, validator, mapper, and Resource Guard permit a Provider-created
   specific selection to pass;
3. Query Runtime admits only a positive ID but does not carry selection
   provenance;
4. the legacy repository permits fuzzy-first title selection and ignores
   ID/title conflicts;
5. the default specific-ID repository call can throw for a missing record even
   though the dispatcher and tests describe a `null`/clarify contract;
6. compatibility parsing and tool metadata disagree about the specific-query
   argument shape;
7. fixture expectations are not uniform for generalized progress language.

The correct final audit verdict is therefore:

```text
MIXED_QUERY_SCOPE_CONTRACT
```

The normative resolution is aggregate-by-default with explicit or
deterministically resolved specific selection. Production conformance must be
implemented and tested in a separately approved phase before another Provider
Gate.

## 10. Next-phase options

### Option A: deterministic Query Scope contract alignment — recommended

Create a single shared Query Scope decision/resolution contract and make every
consumer use it. The next phase should, at minimum:

1. represent selection provenance separately from workspace availability;
2. accept explicit positive IDs only after deterministic existence/access
   validation;
3. add one exact-normalized, unique-title resolver that returns a positive ID;
4. reject zero-match, multi-match, context-only, Provider-selected, and
   ID/title-conflict specific decisions before mapping or dispatch;
5. derive Prompt scope rules and tests from the shared contract;
6. align `parseAgentIntentResult()`, intent metadata, compatibility mapping,
   Resource Guard or a dedicated read-reference guard, and Query Runtime;
7. make generalized fixture expectations use one aggregate rule;
8. retain `cmp-4` as `query_progress -> compose_checklist`;
9. complete deterministic RED/GREEN verification before requesting a new
   focused Provider authorization.

This option changes neither the broad decision-code enum nor the safe
read/write boundary.

### Option B: Prompt-only clarification — rejected

A Prompt-only repair cannot distinguish an explicit trusted ID from a
Provider-selected context ID after generation and leaves the mapper, parser,
title resolver, conflict handling, and fixture matrix inconsistent.

### Option C: migrate `cmp-4` to specific scope — rejected

The fixture has no explicit or deterministically resolved plan selection.
Changing the expectation would encode Provider behavior as product authority
and would make context truncation change query meaning.

### Option D: retain the mixed contract indefinitely — safe but blocking

Keeping Legacy defaults and the current mismatch is operationally safe, but it
cannot satisfy the R3-B semantic Gate or authorize Orchestrator adoption.

Recommended next phase name:

```text
Phase L3-B-R3-D: Deterministic Query Scope Contract Alignment
```

## 11. Non-goals

- No Prompt or example change
- No Orchestrator or intent schema change
- No decision-code or consistency-validator change
- No mapper, Resource Guard, QueryFacts, Query Runtime, dispatcher, or
  allowlist change
- No fixture or evaluator change
- No Provider, retry, timeout, or Gate-threshold change
- No LangGraph, checkpoint, Specialist, Draft, Dry-run, Policy Guard,
  confirmation, Executor, receipt, rollback, Payload schema, or migration
  change
- No default runtime switch, adoption, Legacy deletion, merge, or push
- No raw Prompt, response, reasoning, secret, workspace content, title, or
  resource identifier retention

## 12. Acceptance conditions for the next phase

Before a new Provider Gate is requested, deterministic evidence must prove:

1. generalized progress is aggregate regardless of context cardinality;
2. explicit positive ID selects specific scope only after trusted validation;
3. exact normalized unique title resolution returns a trusted positive ID;
4. zero/multiple title matches clarify;
5. ID/title conflict clarifies or returns a typed conflict;
6. Provider-selected context resources are rejected;
7. `query_progress` and `query_plan_progress` share one args/provenance
   contract across Prompt, validator, mapper, parser, runtime, and tests;
8. `cmp-4` remains an ordered aggregate-read to new-draft compound contract;
9. default Orchestrator remains Legacy and Query adoption remains off;
10. task execution and database mutation remain zero during evaluation.

## 13. Rollback

This phase adds documentation only. Revert its commit with:

```bash
git revert <L3BR3C_AUDIT_COMMIT_SHA>
```

Reverting the document does not change production runtime behavior because
this phase modifies no production code or configuration.
