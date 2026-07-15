# Phase L3-B-R3-A Compound Semantic Accounting Reconciliation

## Status

Approved deterministic forensic-audit design. This phase is intentionally
network-free and does not authorize Provider access, Prompt changes, runtime
adoption, or production decision changes.

Baseline:

- Branch base: `be000ad8c64ddb04712a370d472e52e6cec21eeb`
- Branch: `phase/l3b-r3a-compound-semantic-audit`
- Historical evidence: sanitized L3-B-R2 targeted Run 3, 15 observations
- Historical headline: 10/15 broad decision-code matches, but only 9/15
  exclusive semantic matches
- Default Orchestrator runtime: Legacy

## Goals

1. Reconcile the apparent 10-versus-9 contradiction without rewriting the
   historical report.
2. Give broad decision-code correctness, exclusive semantic correctness,
   overlapping mismatch flags, and exclusive mismatch categories distinct
   names and denominators.
3. Separate completed Orchestrator invocations from usable Orchestrator plans.
4. Make single-intent alternatives and compound-intent task contracts compare
   according to their different meanings.
5. Freeze the cmp-3 and cmp-4 semantic boundaries for a later Prompt-focused
   phase without changing them here.

## Non-goals

- No DeepSeek or other Provider calls, Keychain access, or API-key access
- No Prompt, semantic-example, fixture expectation, schema-enum, output-schema,
  model configuration, retry, timeout, or transport changes
- No production compound/single routing changes
- No Gate threshold reduction
- No runtime adoption, default switch, Legacy removal, or Shadow/Canary change
- No Executor, Policy Guard, confirmation, receipt, rollback, Payload schema,
  migration, checkpoint, Planning, Schedule, or database changes
- No raw prompt, response, reasoning, tool arguments, secret, workspace text,
  or resource identifier retention

## Forensic finding

The historical evaluator assigned two independent meanings to
`semanticDecisionCorrect` and the exclusive mismatch category:

```text
semanticDecisionCorrect = actual decisionCode equals expected decisionCode
exclusive category       = first applicable resource/read-write/mode/intent/
                           clarify mismatch, otherwise match
```

For cmp-4 round 2, the Provider returned `compound_ready`, so the first test
passed. It returned `query_plan_progress` plus `append_plan_item` instead of the
expected `query_progress` plus `compose_checklist`, so the exclusive category
was `intent_mismatch`. The observation was therefore counted in both the old
10/15 “correct” numerator and the six exclusive semantic failures.

This is not a report transcription error. It is a calculation and naming bug:
the old field measures broad decision-code correctness, not complete semantic
correctness. The historical JSON remains immutable; R3-A corrects future
reports and documents how to read the old evidence.

## Metric contract

### Observation populations

- `observations`: every completed harness observation
- `comparable`: observations with at least one strict-schema-valid response
- `not_comparable`: observations without a strict-schema-valid response

The following invariants are mandatory:

```text
exclusive category total = observations
comparable = observations - not_comparable
semantic correct + semantic incorrect = comparable
semantic correct = exclusive match
```

### Broad decision-code correctness

`decisionCodeCorrect` is an overlapping diagnostic. It means only that the
actual broad decision code equals the fixture-derived expected decision code.
It must never be presented as full semantic correctness and is not the
authoritative semantic Gate.

### Exclusive semantic correctness

`semanticDecisionCorrect` means the observation's exclusive mismatch category
is `match`. Its denominator is `comparable`. The semantic Gate continues to
require a 100% rate; this changes the calculation, not the threshold.

### Overlapping mismatch flags

Clarify, intent, mode, read/write, and resource mismatches remain useful
diagnostics. Multiple flags may be true for one observation. Their counts are
not additive and must not be reconciled against the observation total.

### Exclusive categories

Exactly one category is assigned per observation using the existing priority:

```text
resource_mismatch
read_write_mismatch
mode_mismatch
intent_mismatch
clarify_mismatch
match
not_comparable
unclassified
```

Only these categories may be summed to the observation total.

### Invocation completion and usable plan

`orchestratorCompleted` means the Orchestrator invocation returned a successful
typed decision before downstream comparison and safety usability checks.

`orchestratorUsable` means that decision also passed the evaluation's semantic,
DAG, resource, and safety conditions required for a usable plan.

`orchestratorCompletionRate` uses `orchestratorCompleted`.
`usablePlanRate` uses `orchestratorUsable`. Because the historical completion
Gate accidentally enforced usability, R3-A adds an explicit `usable_plan_rate`
Gate at the existing 0.99 threshold while retaining the completion Gate at
0.99. This separates the meanings without weakening acceptance.

## Intent comparison contract

Fixture intent arrays have two distinct meanings:

- For `single`, they are alternative acceptable intents. The actual decision
  must contain exactly one intent and it must be in that allowlist.
- For `compound`, they are the required ordered task intents. The actual list
  must have the same length and match position by position.

Compound order is intentional because task order and downstream dependency
semantics are observable. R3-A does not infer missing intents, accept subsets,
or convert the contract into an unordered set.

## cmp-3 frozen boundary

Fixture: “创建学习计划，并分解成每日任务清单”.

Expected contract:

- mode: `compound`
- decision family: write candidate / compound ready
- ordered intents: `compose_plan`, `compose_checklist`
- clarify: false
- no pre-existing resource ID is required
- checklist composition follows plan composition conceptually

The existing Router protocol explicitly treats plan/checklist composition as
draft-capable and does not require clarification merely because later details
are absent. The three historical `compound_missing_target`/clarify results are
therefore semantic mismatches, not evidence that the fixture expectation should
change.

Likely cause for R3-B investigation: the Orchestrator Prompt's generic
missing-target rule conflicts with this draft-capable compound boundary, and
the only full structured example is single-task. The schema itself permits a
compound result. R3-A records this finding but does not change the Prompt.

## cmp-4 frozen boundary

Fixture: “检查项目进度，记录未完成的作为新任务”.

Expected contract:

- mode: `compound`
- decision family: mixed read/write compound ready
- ordered intents: `query_progress`, `compose_checklist`
- clarify: false
- the write task consumes the deterministic query result conceptually
- no existing checklist ID is required for draft composition

Historical rounds 1 and 3 incorrectly clarified. Round 2 recognized a compound
request but returned `query_plan_progress`, `append_plan_item`; this is an
`intent_mismatch`, even though its broad `compound_ready` decision code matched.
The synthetic context contains a plan but no checklist, so direct append is not
contract-equivalent to draft checklist composition. Sanitized evidence omits
arguments, which is an acknowledged evidence limit, not a reason to rewrite
the fixture expectation.

Likely cause for R3-B investigation: the Prompt's generic unfinished-item
missing-target rule encourages clarification and lacks a cmp-4-style semantic
example. Provider variability is also present because one of three rounds
selected a compound shape. R3-A does not change either input.

## Historical Run 3 reconciliation

The immutable Run 3 evidence is interpreted as:

- observations: 15
- comparable: 15
- broad `decisionCodeCorrect`: 10
- exclusive `semanticDecisionCorrect`: 9
- semantic incorrect: 6
- exclusive categories: 9 match, 5 read/write mismatch, 1 intent mismatch
- historical “completion”: 9, because it was an alias of usable plan
- historical usable plan: 9

The 10th broad decision-code match is cmp-4 round 2. It remains semantically
incorrect. No historical artifact is modified.

## Deterministic test design

Tests must prove:

1. A decision-code match with an intent mismatch increments
   `decisionCodeCorrect` but not `semanticDecisionCorrect`.
2. The reconstructed 15 observations report 10 broad code matches, 9 semantic
   matches, and 6 semantic failures.
3. Exclusive category counts sum to observations.
4. Correct plus incorrect equals comparable.
5. Overlapping mismatch counts are not used as an exclusive total.
6. Zero comparable observations report N/A-compatible count-rate semantics.
7. A completed but unusable decision separates completion from usable plan.
8. The unchanged 0.99 usability requirement fails via `usable_plan_rate`.
9. Single alternative matching and ordered compound matching differ as defined.
10. cmp-3 and cmp-4 expected decisions remain unchanged.
11. The report sanitizer continues to reject raw or secret-bearing fields.

## R3-B proposal boundary

R3-B may address only the frozen compound semantic decision boundary. A future
Provider evaluation requires separate user approval and should use:

1. focused six-request set, up to two rounds (maximum 12 requests);
2. only after the focused Gate passes, one targeted 15-request run;
3. total maximum 27 requests.

R3-A itself performs no Provider evaluation and does not authorize R3-B.
