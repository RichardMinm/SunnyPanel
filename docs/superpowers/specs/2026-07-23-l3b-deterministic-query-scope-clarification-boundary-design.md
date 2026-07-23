# L3-B Deterministic Query Scope Clarification Boundary Design

**Date:** 2026-07-23
**Status:** Approved design; implementation not started
**Baseline:** `bdb912056fb09a475b12db767fc0fff3254d7055`
**Branch:** `phase/l3b-r4a-query-boundary`

## 1. Decision

Add a deterministic clarification boundary for schema-valid Full Orchestrator
decisions that fail the existing Query Scope provenance contract.

The boundary does not reinterpret the Provider decision, infer a corrected
intent, select a workspace resource, or execute anything. It converts an
allowlisted, user-correctable Query Scope rejection into one typed
`clarified` result containing a single non-empty clarification question.

Final business behavior and Provider behavior remain separate:

- the final business decision is the deterministic `clarify`;
- the rejected Provider decision remains visible only as bounded diagnostic
  metadata;
- no rejected query task reaches Mapper, Draft, Dry-run, Policy,
  Confirmation, Executor, Receipt, or Rollback.

This extends the same system-level recovery model already used by the
deterministic resource clarification boundary.

## 2. Live evidence and root cause

The Acceptance 33 run at the baseline completed all 33 observations:

- final semantic matches: `32/33`;
- usable results: `32/33`;
- strict structured schema: `29/29`;
- Provider semantic validation: `29/29`;
- Answer Renderer completion: `5/5`;
- transport availability: `29/29`;
- timeouts: `0/34`;
- logical calls and Provider attempts: `34`;
- Full Orchestrator latency P50: `2102ms`;
- observed upper tail: `5544ms`;
- task execution, database access, database mutation, and business mutation:
  `0`.

The only failed fixture was `exr-3`. The expected final decision is a single
clarify because the imperative completion mutation does not identify an
actor-authorized checklist item. The Provider instead returned the
schema-valid projection:

```text
pure_read_query -> single -> query_plan_progress
```

The existing Query Scope Guard correctly rejected the decision with:

```text
specific_reference_required
```

The rejection was safe but unusable because `invalid_query_scope` currently
returns typed `unavailable`. The existing resource clarification projector is
never reached because Query Scope validation occurs first.

This is not a JSON-mode, schema, transport, retry, database, Mapper, or
execution failure. It is a missing deterministic recovery boundary after a
correct provenance rejection.

The Full Orchestrator protocol already explicitly forbids this `exr-3`
classification. Historical live observations have nevertheless classified
the same request as a completion write, consultation, or specific progress
read. Further Prompt-only changes would move the error shape without ensuring
a usable final result.

## 3. Goals

1. Turn current user-correctable Query Scope rejections into typed,
   deterministic clarification.
2. Preserve the Query Scope validator as authoritative; do not relax or bypass
   provenance validation.
3. Keep Provider deviations observable without counting a safely handled
   rejection as a final-system safety violation.
4. Preserve all existing no-write, no-execution, and no-database guarantees.
5. Make `exr-3` usable regardless of whether the Provider produces the
   already-observed invalid completion write or invalid specific progress
   read.

## 4. Non-goals

This phase does not:

- modify Full or Residual system rules;
- add Prompt examples or change contrastive metadata;
- change fixtures or their expectations;
- infer that an invalid read was really a write;
- build a natural-language pre-router;
- select a resource from workspace uniqueness;
- change Structured Output schema, JSON mode, Provider SDK, temperature,
  timeout, retry, or budget;
- change Query allowlists or default Runtime;
- enter Draft, Dry-run, Policy, Confirmation, or Execute;
- change Payload schema, migrations, LangGraph topology, checkpointing,
  Receipt, or Rollback;
- run a Provider evaluation without a new HEAD-specific disclosure and
  approval;
- begin Stability 99 before Acceptance 33 passes.

## 5. Projectable Query Scope contract

The projector uses an explicit allowlist containing every current
`QueryScopeErrorCode`:

```text
aggregate_for_explicit_plan
explicit_plan_id_not_found
id_title_conflict
invalid_aggregate_args
provider_selected_workspace_resource
specific_reference_required
title_ambiguous
title_not_found
```

Each current code describes a range or provenance decision that cannot be
safely executed and can be resolved by asking the user to confirm the target
or scope.

The allowlist is closed:

- a future Query Scope error code is not automatically projectable;
- an empty, unknown, or non-allowlisted code remains typed `unavailable`;
- the projector never receives Provider text or task arguments;
- the projector consumes only the deterministic error code and its
  repository-owned safe message.

## 6. Typed result contract

Extend `OrchestratorInvocationResult` with a second clarified variant:

```ts
type QueryScopeClarifiedResult = {
  status: "clarified";
  clarificationSource: "query_scope";
  plan: OrchestratorPlan;
  queryScopeErrorCode: QueryScopeErrorCode;
  schemaValidDecision: OrchestratorDecisionProjection;
};
```

The existing resource variant remains unchanged:

```ts
{
  status: "clarified";
  clarificationSource: "resource_readiness";
  plan: OrchestratorPlan;
  resourceIssueCodes: ResourceReadinessErrorCode[];
  schemaValidDecision: OrchestratorDecisionProjection;
}
```

No ambiguous optional-field union is introduced. `clarificationSource`
discriminates the two recovery paths.

## 7. Deterministic projector

Add a focused `query-scope-clarification-projector.ts` module.

Its only responsibility is:

```text
allowlisted QueryScopeErrorCode + deterministic safe message
  -> one immutable OrchestratorPlan
  -> mode=single
  -> tasks=[clarify]
  -> non-empty question
```

The clarification question is repository-owned. It may use the existing
Query Scope validator safe message because that message is deterministic and
contains no Provider or workspace text.

The plan must not contain:

- Provider task arguments;
- a plan ID or title selected from context;
- a guessed write intent;
- a dependency;
- execute, receipt, rollback, or tool instructions;
- raw Provider response, reasoning, prompt, or secret.

## 8. Orchestrator data flow

The Full Orchestrator sequence remains:

```text
invokeStructured
  -> strict schema
  -> semantic decision consistency
  -> DAG validation
  -> Query Scope validation
  -> Resource Readiness
  -> Mapper
```

Only the invalid Query Scope branch changes:

```text
Query Scope invalid
  -> projectQueryScopeErrorToClarification
  -> projectable: typed clarified result
  -> non-projectable: typed unavailable result
```

The rejected structured task does not continue to Resource Readiness or
Mapper. The clarification plan is newly constructed from deterministic code.

`runLangChainOrchestrator()` may continue returning `result.plan` for both
`success` and `clarified`; only `unavailable` uses the generic safe failure
projection.

## 9. Production adapter and final semantics

`ProductionFullRoleEvidence` must retain:

- `status: "clarified"`;
- the Query Scope error code;
- the bounded Provider semantic projection:
  `decisionCode`, ordered intents, mode, and task count;
- Provider attempt, strict-schema, semantic-validation, latency, and failure
  counters.

The production evaluation path then observes:

```text
branch = deterministic_clarify
finalMode = single
finalIntents = [clarify]
clarifyQuestionPresent = true
semanticMatch = fixture expectation comparison against final clarify
```

The raw Provider `query_plan_progress` is never treated as the final business
intent and never reaches Query dispatch.

## 10. Metrics and diagnostic ownership

Add final-system and Provider metrics analogous to resource clarification:

```ts
business.deterministicQueryScopeClarifications: number;
provider.queryScopeDeviations: number;
```

Definitions:

- `deterministicQueryScopeClarifications` counts final observations whose
  Full result is `clarified` with `clarificationSource="query_scope"`;
- `queryScopeDeviations` counts those handled observations whose bounded
  Provider decision failed Query Scope validation.

`zeroTolerance.invalidQueryScopeProvenance` counts only unhandled Query Scope
failures. A projected clarification is not an invalid final-system scope
decision because the rejected query task cannot reach business dispatch.

The Provider deviation remains visible and nonzero when the model made the
mistake. It is diagnostic, not rewritten as Provider success.

Resource clarification counters and their exclusion rules remain unchanged.

## 11. Error handling and safety

- Projector failure or a non-allowlisted code returns typed `unavailable`.
- The boundary never retries the Provider.
- The boundary never falls back to Legacy and never invokes another model.
- The boundary does not emit partial query output.
- The clarification question must pass the existing clarify schema.
- A clarification must remain read-only and non-executable.
- Evaluation must continue hiding the generic failure projection for genuine
  `unavailable` results while exposing typed clarified final semantics.
- Collector and report contracts continue excluding raw prompts, raw
  responses, workspace text, reasoning, errors, stacks, and credentials.

## 12. Deterministic verification

Implementation follows RED-GREEN-REFACTOR and must prove:

1. Every current Query Scope error code creates exactly one valid clarify task.
2. Unknown or non-allowlisted codes cannot be projected.
3. The question is non-empty and contains no Provider-supplied value.
4. `exr-3` invalid `query_plan_progress` becomes a typed query-scope
   clarification.
5. The original Query Scope code and bounded semantic projection remain
   available as diagnostics.
6. The rejected query task never reaches Resource Readiness, Mapper, Query
   dispatch, Draft, Dry-run, or Execute.
7. Existing resource clarification behavior remains unchanged.
8. Genuine unavailable results remain unavailable.
9. Production observation classifies the result as
   `deterministic_clarify`, final `clarify`, semantic match, and usable.
10. Final-system invalid scope remains zero for a handled clarification.
11. Provider query-scope deviation increments for that same observation.
12. Task execution, database access, database mutation, and business mutation
    remain zero.
13. Default Orchestrator and Query Runtime behavior remain unchanged.
14. Reports retain no raw or secret material.

Run the focused tests first, then the existing deterministic baseline required
by the active L3-B phase. No Provider call is part of deterministic
verification.

## 13. Provider revalidation

After implementation is committed and deterministic verification passes:

1. freeze the new clean HEAD and evaluation configuration hash;
2. perform a no-network preflight;
3. disclose the unchanged Acceptance 33 dataset and exact call budgets;
4. obtain new explicit approval for that HEAD;
5. run Acceptance 33 once;
6. stop on any failed Gate.

Acceptance must still satisfy every existing threshold and zero-tolerance
condition. A handled Provider query-scope deviation may be reported as a
diagnostic, while final semantic and usable results must be `33/33`.

Stability 99 remains blocked until a fresh Acceptance 33 passes.

## 14. Exit criteria

The implementation is ready for a new Acceptance request only when:

- the projector and typed result tests pass;
- all current Query Scope error codes have an explicit outcome;
- `exr-3` invalid read and invalid resource-write variants both end as final
  clarify;
- Provider and final-system metrics remain separated;
- no Provider output is reinterpreted into a write;
- no rejected task reaches Mapper or any business side-effect boundary;
- deterministic suites pass;
- runtime defaults are unchanged;
- worktree is clean at a committed HEAD;
- no Provider, database, task execution, or business mutation occurred during
  implementation verification.
