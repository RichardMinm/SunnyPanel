# L3-B Exclusive Semantic Contrast Closure

Date: 2026-07-23

Status: design approved; implementation pending

Branch: `phase/l3b-r4a-query-boundary`

Implementation baseline: `7c441ca547b1be0e261d20e8b05cba051459b288`

## 1. Purpose

Replace the Full Orchestrator semantic contrast blacklist interpretation with
an exclusive admitted-tuple contract.

When a contrast condition matches a request, its admitted `decisionCode`,
`mode`, and ordered intent sequence are the only valid complete semantic
decision. Every other decision, mode, intent sequence, task count, and task
shape is forbidden for that condition.

This closes the remaining Acceptance 33 failure without adding another
one-off forbidden alternative.

## 2. Frozen evidence

Acceptance 33 at the baseline completed all 33 observations:

- semantic matches and usable results: `32/33`;
- structured schema and semantic validity: `29/29`;
- Answer Renderer completion: `5/5`;
- transport availability: `29/29`;
- timeouts: `0/34`;
- logical calls: `34/34`;
- Provider attempts: `34/65`;
- all write, resource, execution, database, duplicate-call, injection, DAG,
  and retention safety counters: `0`.

The only mismatch remained `exr-3`:

```text
expected:
  explicit_write_missing_resource -> single -> clarify

actual:
  pure_consultation -> single -> answer_question
```

The previous repair successfully eliminated the unsafe
`explicit_write_ready -> complete_plan_item` result. The Provider then selected
another structurally valid decision that was not listed in the contrast's
partial forbidden arrays.

## 3. Root cause

Each semantic contrast currently contains:

- one admitted tuple;
- selected `forbiddenDecisionCodes`;
- selected `forbiddenIntents`.

The renderer labels the admitted tuple as correct, but labels only the selected
alternatives as forbidden. This makes the forbidden arrays look exhaustive
even though they are only examples of historically observed errors.

For `imperative_completion_mutation`, the first observed read error and the
second observed write error were listed. `pure_consultation` and
`answer_question` were not, so the Provider could choose a third structurally
valid but semantically wrong branch.

Adding that third branch to the blacklist would not close the model contract.

## 4. Chosen contract

Add one shared Full-only policy constant:

```ts
export const ORCHESTRATOR_SEMANTIC_CONTRAST_MATCH_POLICY =
  "exclusive_tuple" as const;
```

The semantic contrast protocol must render a policy header with this meaning:

```text
matchPolicy=exclusive_tuple
When a case condition matches, the admitted decisionCode, mode, and ordered
intent sequence are the only allowed complete output. Every other decision,
mode, intent sequence, task count, or shape is forbidden.
```

Each contrast line must label its admitted tuple as the unique allowed tuple.
The existing forbidden arrays remain only as bounded, known error examples.
They are not used as the definition of completeness and are not expanded to
enumerate the full schema allowlist.

The `imperative_completion_mutation` admitted tuple remains:

```text
decisionCode=explicit_write_missing_resource
mode=single
intents=clarify
```

Therefore `pure_consultation -> answer_question`,
`pure_read_query -> query_plan_progress`, and
`explicit_write_ready -> complete_plan_item` are all forbidden by the same
exclusive rule without requiring three separate blacklist entries.

## 5. Scope

Allowed production change:

- `src/lib/agent/orchestration/orchestrator-intent-family-protocol.ts`

Allowed deterministic test change:

- `tests/agent/orchestration/orchestrator-semantic-contrast-protocol.test.ts`

No other production or test file is required.

The following remain unchanged:

- the six contrast IDs and their admitted tuples;
- the 33 fixtures and expectations;
- Orchestrator and Router Zod schemas;
- `invokeStructured()` and DeepSeek JSON-mode integration;
- decision consistency, DAG, Query Scope, Resource Readiness Guard, and Mapper;
- Gate accounting, thresholds, retry budgets, timeout, and report shape;
- Full/Residual model configuration;
- Primary/Legacy decisions and default runtime;
- Draft, Dry-run, Policy, Confirmation, Executor, Receipt, and Rollback;
- Payload schema, migrations, LangGraph topology, and business persistence.

## 6. Prompt boundary

The policy is rendered only through
`ORCHESTRATOR_SEMANTIC_CONTRAST_PROTOCOL`, which the Full Orchestrator already
includes.

The Residual Planner continues to exclude:

- the semantic contrast marker;
- the semantic contrast policy;
- every contrast case.

Workspace context remains untrusted user-role data. No fixture message,
Provider response, hidden reasoning, credential, or evaluation artifact is
copied into the Prompt.

## 7. Runtime behavior

Runtime processing remains:

```text
Provider structured output
-> strict Zod schema
-> decision consistency
-> DAG validation
-> Query Scope provenance
-> Resource Readiness Guard
-> compatibility Mapper
```

The exclusive tuple policy changes Provider instructions only. It does not
repair or reinterpret an invalid result. A Provider violation still remains a
measured mismatch or typed unavailable result and cannot reach execution.

## 8. Deterministic verification

Implementation follows RED-GREEN-REFACTOR.

The RED contract must require:

1. The shared match policy constant equals `exclusive_tuple`.
2. The Full Prompt contains the policy header.
3. Every contrast line states that its admitted tuple is uniquely allowed.
4. The policy explicitly rejects every other decision, mode, intent sequence,
   task count, and task shape.
5. The known forbidden arrays remain bounded examples, not an exhaustive
   schema expansion.
6. The Residual Prompt still excludes the semantic contrast marker and policy.
7. The `imperative_completion_mutation` admitted tuple remains unchanged.
8. Fixture messages remain absent from the trusted system Prompt.

The RED test must fail because the current protocol has no policy constant or
exclusive wording. GREEN adds only the policy constant and renderer text.

Focused verification runs the semantic contrast contract, Full Orchestrator
boundary tests, Residual input contract, typecheck, and whitespace check.
There is no Provider or database call.

## 9. Live revalidation

Implementation does not include a Provider request.

After a clean implementation commit, preserve the failed baseline report and
run a no-network Acceptance preflight. The next live Acceptance 33 run requires
separate informed approval tied to:

- the exact new HEAD;
- the exact evaluation configuration hash;
- the original 33 synthetic messages and synthetic workspace contexts;
- updated Full/Residual rules and strict schemas;
- up to five consultation Answer Renderer requests;
- no more than 34 logical calls and 65 Provider attempts.

Stability 99 remains blocked until Acceptance 33 passes all existing gates.

## 10. Exit criteria

The implementation is ready for another Acceptance 33 run only when:

- RED failure proves the exclusive policy is absent;
- GREEN and focused regression tests pass;
- only the two scoped files differ from the baseline;
- admitted tuples, fixtures, Gate accounting, and deterministic validators
  have no diff;
- runtime defaults remain unchanged;
- no Provider, database, execution, or mutation occurred;
- the implementation is committed and the worktree is clean.
