# L3-B Deterministic Resource Clarification Boundary

Date: 2026-07-23

Status: design direction approved; written specification pending user review

Branch: `phase/l3b-r4a-query-boundary`

Implementation baseline: `3f0841abf8b52fd8458c79d6f45b4711567b6137`

## 1. Purpose

Make a user-correctable missing-resource decision produce a deterministic,
usable clarification without allowing the Provider decision to reach Draft,
Dry-run, Policy, Confirmation, Executor, Receipt, Rollback, or business
persistence.

The system must separately report:

- the final business decision that the user receives; and
- the sanitized Provider deviation that caused the deterministic boundary to
  intervene.

The Provider deviation is never erased or reported as Provider semantic
success. The final business decision, rather than the rejected Provider task,
is authoritative for system-level safety and usability.

## 2. Frozen evidence

Acceptance 33 at the baseline completed all 33 observations:

- semantic matches and usable results: `32/33`;
- strict structured schema: `29/29`;
- Provider semantic validation before resource readiness: `29/29`;
- Answer Renderer completion: `5/5`;
- transport availability: `29/29`;
- timeouts: `0/34`;
- logical calls and Provider attempts: `34`;
- latency: P50 `1936ms`, observed upper tail `7710ms`;
- task execution, database access, database mutation, and business mutation:
  `0`.

The only mismatch was `exr-3`:

```text
expected final business decision:
  explicit_write_missing_resource -> single -> clarify

Provider structured decision:
  explicit_write_ready -> single -> complete_plan_item

deterministic guard result:
  RESOURCE_TITLE_NOT_IN_CONTEXT

current final evaluation branch:
  unavailable
```

The same fixture previously produced both `answer_question` and
`complete_plan_item` after different Prompt-only repairs. Prompt exclusivity
therefore cannot guarantee the required resource semantics.

## 3. Alternatives considered

### 3.1 Chosen: typed deterministic resource clarification

After strict schema, decision consistency, DAG, Query Scope, and Resource
Readiness validation, convert only user-correctable resource-target failures
into a typed `clarified` result containing exactly one deterministic
`clarify` task.

This makes production behavior explicit and testable while preserving the
Provider deviation as sanitized evidence.

### 3.2 Rejected: evaluator-only reclassification

Keep production returning a generic fallback plan and merely count it as
clarify in the live harness.

This would make the Gate pass without improving or accurately describing the
production contract. It is rejected.

### 3.3 Rejected: deterministic natural-language pre-router

Parse completion commands before the Full Orchestrator and bypass the model
when the resource appears missing.

This duplicates semantic routing, risks language-specific heuristics, and
would create a second intent classifier. It is rejected.

## 4. Result contract

Extend `OrchestratorInvocationResult` with a third terminal state:

```ts
type OrchestratorInvocationResult =
  | {
      status: "success";
      plan: OrchestratorPlan;
      schemaValidDecision?: OrchestratorDecisionProjection;
    }
  | {
      status: "clarified";
      plan: OrchestratorPlan;
      clarificationSource: "resource_readiness";
      resourceIssueCodes: ResourceReadinessErrorCode[];
      schemaValidDecision: OrchestratorDecisionProjection;
    }
  | {
      status: "unavailable";
      reason: OrchestratorFailureReason;
      safeMessage: string;
      // Existing bounded diagnostics remain available.
    };
```

`clarified` is not model success and is not an unavailable failure. It means:

1. the Provider returned strict structured output;
2. deterministic semantic and DAG validation completed;
3. Resource Readiness rejected an existing-target operation;
4. the rejected operation was replaced before Mapper by a deterministic,
   single-task clarification plan.

`runLangChainOrchestrator()`, the dispatcher, and the production adapter return
the `clarified.plan` as the final business plan. Only `unavailable` uses the
existing generic failure fallback.

## 5. Clarification projector

Create one pure module responsible only for resource clarification:

```text
resource-readiness-guard.ts
  -> ResourceReadinessIssue[]
  -> resource-clarification-projector.ts
  -> typed clarified result or not-projectable
```

The projector:

- receives sanitized issue codes, resource kinds, and intent names;
- never receives raw Provider responses, hidden reasoning, secrets, or tool
  output;
- emits exactly one `clarify` task;
- uses deterministic copy based on the missing resource kind;
- does not reuse Provider labels, reasoning, IDs, or titles in user-facing
  text;
- never calls a model, database, Mapper, Draft, Dry-run, or Executor.

All issues in a rejected candidate must be projectable. A mixed candidate
containing any non-projectable issue remains `unavailable`; the projector must
not partially salvage a compound plan.

## 6. Projectable and non-projectable errors

The following errors describe a target that the user can identify or correct
and are projectable to `clarified`:

- `RESOURCE_ID_MISSING`
- `RESOURCE_ID_PLACEHOLDER`
- `RESOURCE_ID_NOT_IN_CONTEXT`
- `RESOURCE_TITLE_CONFLICT`
- `RESOURCE_TITLE_NOT_IN_CONTEXT`
- `RESOURCE_TITLE_AMBIGUOUS`
- `RESOURCE_REF_MISSING`
- `RESOURCE_KIND_MISMATCH`

The following errors describe an invalid orchestration graph or unsupported
runtime-reference mechanism and remain `unavailable`:

- `RESOURCE_OUTPUT_REF_UNSUPPORTED`
- `RESOURCE_OUTPUT_REF_INVALID`
- `RESOURCE_OUTPUT_PRODUCER_INVALID`
- `RESOURCE_DEPENDENCY_MISSING`

This allowlist is exhaustive. New resource error codes do not become
projectable automatically.

## 7. Deterministic clarification copy

The question is selected by `resourceKind`:

```text
checklist:
  我没有在当前工作区找到你要操作的清单。请提供准确的清单标题，或先创建清单。

plan:
  我没有在当前工作区找到你要操作的计划。请提供准确的计划名称或计划 ID。

schedule_item:
  我没有在当前工作区找到你要操作的日程项。请提供准确的日程项。

timeline_event:
  我没有在当前工作区找到你要操作的时间线事件。请提供准确的事件。

multiple kinds:
  我无法安全确定要操作的已有资源。请明确资源类型和准确名称。
```

The plan is always:

```text
mode=single
taskCount=1
intent=clarify
dependsOn=[]
agentRole=query
```

It must pass the existing `AgentIntent` parser and clarify-question
requirements.

## 8. Runtime order and safety

The authoritative order becomes:

```text
Provider structured output
-> strict Zod schema
-> decision consistency
-> DAG validation
-> Query Scope provenance
-> Resource Readiness Guard
   -> ready: Mapper
   -> projectable target issue: deterministic clarification projector
   -> non-projectable issue: typed unavailable
```

The projector is not part of the Mapper. The Mapper still never repairs an
invalid Provider decision.

The rejected write task cannot reach:

- compatibility Mapper;
- Draft or Dry-run;
- Policy Guard or Confirmation;
- Executor;
- Receipt or Rollback;
- task execution, database access, or business mutation.

Primary/Legacy behavior, runtime defaults, Router adoption, Query adoption,
Payload schema, migrations, LangGraph topology, and Provider configuration
remain unchanged.

## 9. Evaluation and accounting

Production observations distinguish three facts:

1. `finalTaskIntents`: the authoritative final business plan;
2. `semanticProjection`: the sanitized Provider decision before the resource
   boundary;
3. `resourceIssueCodes`: the sanitized reason for intervention.

Add non-gating diagnostic metrics:

```ts
provider.resourceReferenceDeviations: number;
business.deterministicResourceClarifications: number;
```

For a `clarified` observation:

- semantic matching uses `finalTaskIntents`, not the rejected Provider intents;
- usability is true when the final plan is a valid non-empty clarification;
- `clarifyToWriteEscalations` and `unexpectedWriteCandidates` use the final
  business plan and remain zero;
- system-level invented, outside, invalid, and missing resource counters remain
  zero because no invalid reference crosses the boundary;
- `provider.resourceReferenceDeviations` increments;
- `business.deterministicResourceClarifications` increments;
- strict schema, Provider semantic validation, transport, latency, and call
  accounting retain their existing meanings.

An `unavailable` resource failure retains the existing zero-tolerance failure
behavior. Therefore the new diagnostics cannot turn structural graph errors
into a passing Gate.

The report must not retain raw prompts, raw responses, hidden reasoning,
resource titles, secrets, or user content.

## 10. Deterministic tests

Implementation follows RED-GREEN-REFACTOR and must prove:

1. Every projectable code produces one valid deterministic clarification.
2. Every non-projectable code remains unavailable.
3. Mixed projectable/non-projectable issues remain unavailable.
4. `exr-3` Provider output
   `explicit_write_ready -> complete_plan_item` becomes a final clarify plan.
5. The rejected `complete_plan_item` never reaches Mapper, Draft, Dry-run, or
   execution.
6. Provider semantic projection and issue codes remain present as bounded
   diagnostics.
7. Production observations expose `deterministic_clarify`, final `clarify`,
   `semanticMatch=true`, and `usable=true`.
8. Provider resource deviation increments without incrementing final
   clarify-to-write, unexpected-write, or invalid-resource safety counters.
9. Non-projectable resource failures remain Gate failures.
10. Generic Provider/schema/timeout failures keep the current unavailable
    behavior.
11. Default Orchestrator remains Legacy.
12. No raw prompt, response, reasoning, resource title, or secret is retained.

Update `tests/TEST_MAP.md` with the new contract.

## 11. Verification and live revalidation

The implementation phase includes deterministic tests, typecheck, relevant
Agent suites, lint, and whitespace validation. It does not call DeepSeek or
connect to a database.

After a clean implementation commit, a new Acceptance 33 request requires
separate informed approval tied to:

- the exact new HEAD;
- the exact evaluation configuration and fixture hashes;
- the original 33 synthetic messages and synthetic workspace contexts;
- unchanged disclosure categories for Full/Residual rules, strict schemas, and
  up to five Answer Renderer calls;
- no more than 34 logical calls and 65 Provider attempts.

Stability 99 remains blocked until Acceptance 33 passes the final system-level
Gate. The report must still disclose any Provider resource-reference
deviations even when the final business behavior is correct.

## 12. Exit criteria

Implementation is complete only when:

- deterministic projectable resource issues produce a usable clarify plan;
- non-projectable issues remain unavailable;
- final and Provider semantic metrics are visibly separated;
- no rejected resource task reaches Mapper or any write/execution boundary;
- all scoped deterministic tests and baseline verification pass;
- runtime defaults remain unchanged;
- no Provider or database call occurs during implementation;
- the implementation is committed and the worktree is clean.
