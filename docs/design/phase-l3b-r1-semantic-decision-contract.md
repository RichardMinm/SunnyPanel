# Phase L3-B-R1 Semantic Decision Contract Design

## Status

Approved on 2026-07-14. Baseline SHA: `24b082616237fcb25763b93a87d80fed3e84302c`.

This phase closes semantic instability inside schema-valid Orchestrator decisions. It does not adopt the LangChain Orchestrator, change the default runtime, execute tasks, or modify the Answer, Specialist, Domain, LangGraph, database, Draft, Dry-run, Policy Guard, Confirmation, Receipt, or Rollback paths.

## Approved interpretations

Two conflicts in the original phase brief were resolved explicitly before implementation:

1. `mode` remains the existing structural enum, `single | compound`, and `tasks` remains non-empty. The new `decisionCode` carries semantic request classification. Consultation and clarify outcomes continue to use one compatibility task.
2. Task-output references are not an executable L3-B capability. Their formal status is `unsupported_clarify`. Fixture `cmp-1` keeps its ID, message, and category, but its expectation changes from compound write to single clarify. This is the only approved fixture expectation revision.

## Considered approaches

### Schema field plus deterministic validator — selected

Add one schema-derived decision enum to the existing Orchestrator schema, then validate semantic consistency after strict Zod parsing and before DAG/resource validation. This preserves the compatibility mapper while making semantic failures typed and observable.

### Zod discriminated union — rejected

A seven-branch union could encode more rules in Zod, but it would complicate LangChain JSON-schema construction and create an effectively parallel contract for otherwise identical task structures.

### Prompt and Resource Guard only — rejected

Prompt-only classification cannot reject a schema-valid decision whose mode and intent family contradict its claimed semantic class.

## Schema contract

The existing schema receives one required top-level field derived from a shared constant:

```ts
export const ORCHESTRATOR_DECISION_CODES = [
  "pure_consultation",
  "pure_read_query",
  "explicit_write_ready",
  "explicit_write_missing_resource",
  "compound_ready",
  "compound_missing_target",
  "unsupported_request",
] as const;
```

The output remains:

```ts
type OrchestratorOutput = {
  version: number;
  decisionCode: OrchestratorDecisionCode;
  mode: "single" | "compound";
  routingSummary: string;
  tasks: OrchestratorTask[];
};
```

No top-level `reply`, `clarifyQuestion`, free-form reasoning, or alternate schema is added. Clarification text remains at `tasks[0].args.question`. The compatibility mapper ignores `decisionCode` after it has passed validation.

The schema version and frozen evaluation protocol metadata advance together in this single semantic protocol revision.

## Decision consistency contract

A pure validator accepts or returns one stable typed error. It never edits Provider output, guesses an intent, retries, calls a model, or invokes Legacy.

| Decision code | Structural contract |
| --- | --- |
| `pure_consultation` | `single`; exactly one consultation-family task; no query, write, or clarify task |
| `pure_read_query` | `single`; exactly one read-query-family task; no consultation, write, or clarify task |
| `explicit_write_ready` | `single`; exactly one write-candidate task; resource readiness must subsequently pass |
| `explicit_write_missing_resource` | `single`; exactly one `clarify` task with a non-empty question |
| `compound_ready` | `compound`; at least two tasks; at least one write candidate; no clarify task; DAG and resources must subsequently pass |
| `compound_missing_target` | `single`; exactly one `clarify` task with a non-empty question; no partial read/write DAG |
| `unsupported_request` | `single`; exactly one safe `clarify` task; no write candidate |

Consultation and read-query families are shared schema-adjacent constants. They never mix safety classes. Write classification reuses the existing deterministic intent classifier rather than a Prompt-only list.

Validation order is fixed:

```text
strict Zod
→ capture sanitized semantic projection
→ decision consistency
→ DAG validation
→ resource readiness
→ compatibility mapper
```

This order ensures Resource Guard cannot hide a Provider semantic mismatch. A failed consistency check returns a typed unavailable result and does not fall back.

## Prompt protocol

The Prompt renders field names, decision codes, modes, roles, intents, and resource rules from shared constants. It uses the following classification order:

1. Determine whether the user explicitly requested a state change.
2. For a state change, determine whether every required resource and target is trusted and ready.
3. Determine whether there are at least two real, jointly required or dependent actions.
4. Select exactly one `decisionCode`.
5. Emit the compatible `mode` and task shape required by that code.

The Prompt distinguishes consultation, read query, ready write, missing-resource write, compound ready, compound missing target, and unsupported request. It includes at most three category-level contrastive example groups and never names fixture IDs or copies fixture messages.

Workspace context remains untrusted user-role data. The Prompt forbids execution, persistence artifacts, Markdown, extra explanation, raw reasoning, invented IDs, and task-output references.

## Resource consistency

The resource index becomes a sanitized ID-to-title projection while retaining ID membership checks. For resource-consuming write tasks:

- trusted ID only is accepted;
- trusted ID plus matching title is accepted;
- trusted ID plus conflicting title is rejected deterministically;
- title only, placeholder ID, and ID outside the context allowlist are rejected;
- a title never overwrites an ID, and an ID never suppresses a supplied title conflict.

The Prompt requires a user-supplied ID and title to be copied into the task arguments. The guard compares those arguments with the already loaded sanitized resource projection. It performs no database lookup or mutation.

## Task-output references

The repository currently validates portions of task-output reference shape and dependency structure, and the execution bus propagates upstream artifacts generically, but there is no complete, field-declared `taskOutput` resolution contract. L3-B-R1 therefore does not claim execution support.

Any task-output reference receives a deterministic typed rejection and a safe clarify outcome. Prompt examples and guard projections stop advertising task-output as ready. Full reference execution remains deferred to a later phase.

## Evidence design

Before Prompt or Schema changes, an evidence-only change adds a sanitized decision projection and disagreement classifier to the explicit live harness.

The previous 99-run log supports 11 disagreement rows but did not retain actual intents. Those cells are recorded as `not_retained`; they are never reconstructed from raw data or guessed. All other provable fields are retained, including fixture ID, round, structural mode/task count, mismatch category, and usability.

The harness then runs the five targeted fixtures three times on the pre-change protocol. This 15-observation baseline records only enum values, counts, booleans, typed error codes, and latency/call accounting. It never records the fixture message, workspace title or ID, context, raw prompt, raw response, hidden reasoning, or secret.

Evidence reports include distributions by fixture, round, direction, expected class, and actual class. Semantic comparison occurs before resource usability is applied.

## Tests and commits

Implementation follows test-driven development.

The evidence commit contains only disagreement classification, sanitized harness counters/projections, the immutable fixture-contract assertion including the approved `cmp-1` exception, and RED contract tests. Its message is:

```text
test(agent): capture orchestrator semantic disagreements
```

The implementation commit is the phase's only semantic protocol revision. It contains schema-adjacent decision constants, the existing schema revision, Prompt revision, decision validator, resource conflict handling, task-output rejection, and focused tests. Its message is:

```text
fix(agent): close orchestrator semantic decision contract
```

`tests/TEST_MAP.md` is updated without deleting or weakening protected tests.

## Live validation and stop rules

Live validation is explicit, database-disconnected, and absent from default CI:

1. Run `qry-1`, `qry-2`, `cmp-3`, `cmp-4`, and `mis-2` three times each. Continue only with 15/15 strict schema and semantic correctness, zero invented resources, zero unsafe writes, and zero unexpected duplicate calls.
2. Run the 33-fixture single-round acceptance. Continue only with 33/33 strict schema and usable plans plus every safety/provider/timeout/duplicate metric at zero.
3. Run known-ID diagnostics separately and exclude them from all gating denominators.
4. Run fresh 99 only if every earlier gate passes.

Any failed gate stops the phase. It does not authorize another Prompt revision, fixture substitution, runtime adoption, or expansion of the task-output capability.

Conversational Answer configuration and behavior remain frozen. Role-based model-call accounting, observation-level timeout denominators, raw-retention protection, no task execution, and no database mutation remain mandatory.

## Rollback boundary

The design, evidence, and implementation commits remain independently revertible. Reverting the implementation restores the prior schema and Prompt without changing the current default Legacy runtime.
