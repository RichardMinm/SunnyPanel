# Phase L3-B-R4-A: Hybrid Query Boundary Contracts

Status: Task 2 contract closure. This document defines the GREEN implementation target but does not authorize or contain the production implementation.

Baseline: `97001efff7d725d91cd61883d3e92a3d2eb9e592`

## Scope and invariants

The deterministic Query Boundary owns progress-query scope before a LangChain Orchestrator Provider can choose it. It does not execute tasks, bypass Query Runtime adoption, change any runtime default, or alter the LangGraph topology.

The active path is fixed as:

```text
runOrchestrationStep
  -> existing consultation/follow-up preflight
  -> Hybrid Query Boundary (only when Orchestrator Runtime is langchain)
  -> existing Provider dispatcher when the Boundary is not applicable
```

The four boundary outcomes are:

| Outcome | Next step | Full Orchestrator calls | Residual Planner calls |
| --- | --- | ---: | ---: |
| `pure_query` | Existing Query Dispatcher with a deterministic `preResolvedIntent` | 0 | 0 |
| `clarify` | Existing early-exit persistence/stream path | 0 | 0 |
| `compound` | Residual Planner, deterministic Composer, guards, Mapper, existing compound subgraph | 0 | at most 1 logical call |
| `not_applicable` | Existing Orchestrator dispatcher | at most 1 logical call | 0 |

Legacy remains the default Orchestrator Runtime. Empty, unknown, and explicit `legacy` runtime values disable the Boundary. Query Runtime and Query adoption remain separately defaulted to `legacy` and `off`.

## Shared vocabulary

The implementation must derive intent membership from existing shared sources:

- Query intents: `READ_QUERY_INTENTS` and the existing Query Runtime eligibility contract.
- Consultation intents: `CONSULTATION_INTENTS`.
- Write classification: the existing deterministic safety classifier.
- Intent names and task structure: the current Router/Orchestrator schemas.

`IntentFamily` is metadata, not another intent allowlist:

```ts
type IntentFamily = "consultation" | "query" | "write_candidate";
```

No production module may maintain a second handwritten list of query intent names.

## Actor-authorized resource snapshot

The Boundary must not accept client resource flags or an unwrapped Provider workspace projection. Its resource input is an immutable snapshot constructed inside the authenticated server pipeline from the workspace context that has already been loaded:

```ts
type ActorAuthorizedResourceSnapshot = Readonly<{
  actorKind: "authenticated_payload_user";
  plans: readonly Readonly<{
    id: number;
    normalizedTitle: string;
  }>[];
}>;
```

Construction rules:

1. The actor comes from the authenticated Payload request, never request-body metadata.
2. Plans come only from the existing loaded `AgentPromptContext`; construction performs no database read.
3. Only positive integer IDs and normalized non-empty titles enter the snapshot.
4. The type expresses source authority, not a new multi-user RBAC policy.
5. The snapshot is read-only and contains no Provider-generated selection or provenance.

Invalid actor/source inputs return a typed `actor_not_trusted` or `snapshot_source_invalid` result before boundary resolution.

## Query scope provenance sidecar

The fixed Query task has metadata outside the task payload:

```ts
type FixedTaskMetadata = Readonly<{
  taskId: string;
  ownership: "deterministic_query_boundary";
  queryScopeProvenance: QueryScopeProvenance;
}>;
```

The only constructible provenance variants remain:

```text
aggregate / user_unspecified
plan / explicit_plan_id
plan / resolved_exact_title
```

Context uniqueness, Provider-selected workspace resources, fuzzy title matching, and implicit recent-resource selection are not members of `QueryScopeProvenance` and must be rejected at runtime if received through an untyped boundary.

The sidecar may enter deterministic validation, sanitized trace categories, and evaluation counters. It must not enter task args, Mapper output, persistence, checkpoint, Draft, Executor, Receipt, or Rollback. The sidecar is stripped from the business plan boundary after validation.

## Pure Query and clarify contracts

For a pure Query, the Boundary creates the existing `AgentIntent` shape and passes it to `dispatchPreResolvedQuery`. It does not call the facts repository, commentary runner, or a lower-level Query runner itself. Therefore Query Runtime, Query adoption, trusted actor, and Query eligibility continue to decide whether the request is adopted.

For deterministic clarify, the Boundary produces a schema-valid single-task `OrchestratorOutput`:

```text
mode = single
tasks.length = 1
intent = clarify
args.question = non-blank string
```

The output is projected through the existing early-exit path with zero Provider calls. It is not sent through Query Dispatcher adoption.

## Residual planning input

Residual planning uses the full original request and a structured satisfied-task ledger:

```ts
type ResidualPlanningInput = Readonly<{
  originalRequest: string;
  authorizedSnapshot: ActorAuthorizedResourceSnapshot;
  fixedTasks: readonly FixedTaskSummary[];
  satisfiedIntentFamilies: readonly IntentFamily[];
  allowedIntentFamilies: readonly IntentFamily[];
  forbiddenIntentFamilies: readonly IntentFamily[];
}>;
```

There is no `remainingRequest`. Query text is not removed with regex, substring, offsets, or free-form rewriting. The complete original request is sent with the structured ledger so write meaning cannot be silently discarded.

When a fixed Query task exists:

```text
satisfiedIntentFamilies includes query
forbiddenIntentFamilies includes query
```

The Residual Planner is allowed one logical call. Transport retries increase `residualPlannerProviderAttempts` but do not increase `residualPlannerLogicalCalls`. Its structured output is validated against the existing task schema and shared intent-family classifier.

If any returned task belongs to the Query family, the result is typed `forbidden_intent`. The entire compound plan becomes unavailable. The task must not be deleted and the remaining tasks must not continue as a successful plan. Semantic validation does not trigger a second logical planning call.

## Deterministic Composer

The input and output contracts are fixed:

```ts
type FixedTaskPlanCompositionInput = Readonly<{
  fixedQueryTask: OrchestratorTask;
  fixedMetadata: FixedTaskMetadata;
  residualTasks: readonly OrchestratorTask[];
}>;

type HybridOrchestrationCandidate = Readonly<{
  output: OrchestratorOutput;
  fixedTaskMetadata: readonly FixedTaskMetadata[];
}>;
```

The Composer returns a typed success or failure result. It does not return `OrchestrationPlan`, call the compatibility Mapper, or execute tasks.

Composition algorithm:

1. Reject a non-Query fixed task or a Query-family residual task.
2. Reject duplicate residual IDs and every unknown residual dependency.
3. Assign the fixed Query task `t1`.
4. Assign residual tasks `t2...tn` in their original order.
5. Build a complete residual old-ID to new-ID map.
6. Rewrite every residual dependency through that map.
7. Add `t1` only to residual roots; preserve remapped internal dependencies for non-roots.
8. Rewrite the sidecar task ID to `t1` without inserting metadata into task args.
9. Emit `version=2`, `decisionCode=compound_ready`, `mode=compound` and a bounded display-safe routing summary.
10. Parse the candidate with the strict existing Orchestrator schema and require the existing DAG validator to pass.

After Composer success, `runOrchestrationStep` owns this order:

```text
query-scope/provenance validation
  -> DAG validation
  -> resource readiness
  -> mapStructuredOutputToPlan(candidate.output)
  -> existing compound subgraph
```

The compatibility Mapper remains unchanged.

## Model-call accounting

The existing role union must gain `residual_planner` during GREEN implementation. Its snapshot gains logical-call and Provider-attempt counters without retaining request text, task IDs, scope IDs, prompts, or responses.

Required accounting:

```text
pure query: orchestrator=0, residual planner=0
clarify: all model roles=0
compound: orchestrator=0, residual planner logical<=1
not applicable: orchestrator logical<=1, residual planner=0
transport retry: provider attempts increase, logical calls unchanged
unexpectedDuplicateModelCalls=0
```

Query commentary remains separately counted and is not treated as an Orchestrator or Residual Planner call.

## Hybrid evaluation harness

The R3 harness is not an R4 gate because it invokes the full Orchestrator directly. The R4 harness must call the same hybrid entry used by `runOrchestrationStep`, with injected deterministic dependencies and an injected fake Residual Planner in tests.

Each sanitized observation records only bounded categories and counters:

```ts
type HybridEvaluationObservation = Readonly<{
  fixtureId: string;
  boundaryResolution: "clarify" | "compound" | "not_applicable" | "pure_query";
  queryDispatcherSelection: "adopted" | "legacy" | "not_called";
  fullOrchestratorLogicalCalls: number;
  residualPlannerLogicalCalls: number;
  queryCommentaryLogicalCalls: number;
  finalTaskIntents: readonly string[];
  finalDependencies: readonly Readonly<{ taskId: string; dependsOn: readonly string[] }>[];
  finalUsableStatus: "unavailable" | "usable";
}>;
```

No observation stores the original request, workspace titles/IDs, prompt, response, reasoning, secret, or hidden model envelope.

Focused fixtures are frozen:

| Fixture | Boundary contract |
| --- | --- |
| `qry-1` | aggregate pure Query; full Orchestrator calls 0 |
| `qry-4` | deterministic clarify; all Provider calls 0 |
| `inj-2` | injection remains untrusted data; aggregate pure Query; full Orchestrator calls 0 |
| `cmp-4` | fixed `query_progress` from Boundary plus one residual `compose_checklist`; synthetic compound output |

For `cmp-4`, the harness must prove the Query task ownership is `deterministic_query_boundary`, not Provider output.

## RED-to-GREEN boundary

Task 2 may add only this design, test-side type contracts, fixtures, and RED tests. Production modules intentionally remain absent. The RED suite loads the future production entry points dynamically so repository typecheck succeeds while focused tests fail with explicit `R4A_RED_UNIMPLEMENTED` diagnostics.

GREEN may begin only when every RED failure is attributable to one of these absent modules and all adjacent pre-existing tests still pass. GREEN must not change Prompt text, Provider configuration, Query allowlists, runtime defaults, LangGraph topology, compatibility Mapper, Payload schemas, or the Draft/Policy/Confirmation/Executor chain.
