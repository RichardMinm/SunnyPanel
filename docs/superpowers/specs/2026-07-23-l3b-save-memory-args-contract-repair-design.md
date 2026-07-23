# L3-B Save Memory Args Contract Repair Design

## Status

Approved direction: combine a shared, deterministic task-argument contract with
one bounded schema-repair retry. The implementation must improve final business
usability without guessing missing content or hiding first-attempt Provider
violations.

This design is limited to the `save_memory.content` failure exposed by
Stability 99. It does not authorize Orchestrator adoption, Runtime switching,
new business capabilities, database access, execution, or broad argument-schema
redesign.

## Evidence and Root Cause

At HEAD `be1cb76d880f843acbefaf3f60996025e1f0dfd1`:

- Acceptance 33 passed `33/33`.
- Stability 99 completed all observations but failed at `97/99`.
- Both failures were `wrt-3`, rounds 2 and 3.
- Both Provider results passed the current strict Structured Output schema and
  decision-consistency validation.
- Both selected
  `explicit_write_ready -> save_memory`, with one task and `single` mode.
- Both produced no final `AgentIntent`.
- `orchestratorPlanToIntent()` can return `null` for that exact one-task shape
  only when `parseAgentIntentResult()` rejects the task arguments.
- In the `save_memory` parser, the required condition is a non-empty string
  `args.content`.

The sanitized report intentionally does not retain raw task arguments. The
evidence therefore proves that `content` was absent, empty, or the wrong type,
but does not distinguish those three raw variants.

The contract gap is:

1. `orchestratorTaskSchema` accepts `args` as a generic record.
2. decision consistency validates decision, intent, mode, and task count, but
   not intent-specific arguments.
3. the Full Orchestrator prompt explains when to choose `save_memory`, but does
   not render its required argument contract.
4. the real `AgentIntent` parser requires non-empty `content`.
5. a Provider result can therefore be schema-valid and semantically classified
   correctly while remaining unusable by the business pipeline.

## Goals

1. Make the required `save_memory.content` contract explicit to the Provider
   from a repository-owned constant.
2. Validate the same contract inside Structured Output validation, before
   decision consistency, Query Scope, Resource Readiness, Mapper, Draft, or any
   business path.
3. Permit at most one schema-repair retry for this live Orchestrator profile.
4. Give the retry only bounded field-path guidance; never include the raw
   response, raw arguments, hidden reasoning, workspace values, or secrets.
5. Keep the first invalid Provider response visible in attempt accounting and
   strict-schema denominators.
6. Fail closed with the existing typed schema failure if the retry is also
   invalid.
7. Preserve Legacy as the default Runtime.

## Non-goals

- Do not infer or synthesize `content` from the user message.
- Do not strip natural-language prefixes with regex or substring parsing.
- Do not convert invalid arguments into a write candidate.
- Do not add a second logical model role or a parallel Orchestrator call.
- Do not change decision codes, intents, fixtures, fixture expectations, model,
  temperature, timeout, transport retries, or safety thresholds.
- Do not modify Mapper, Draft, Dry-run, Policy Guard, Confirmation, Executor,
  Receipt, Rollback, Payload schema, migrations, LangGraph topology, Query
  adoption, Router adoption, or Specialist behavior.
- Do not retain raw Provider output or task arguments in reports.
- Do not run a Provider during implementation or deterministic verification.

## Considered Approaches

### 1. Shared contract plus deterministic validation only

This closes false success safely and improves the prompt, but a single
first-attempt Provider omission would still make the user request unavailable.
It is safe but does not provide the best final product experience.

### 2. Deterministically fill `content` from the original user message

This maximizes apparent success and avoids an extra Provider attempt, but it
silently repairs model output and may store command wording rather than the
intended memory. It conflicts with the fail-closed architecture and is
rejected.

### 3. Shared contract, deterministic validation, and one bounded repair retry

This is the selected approach. The first attempt receives the complete
contract. If it still violates that contract, the same logical invocation may
make one additional Provider attempt with a sanitized repair instruction.
Invalid output is never guessed or sent downstream.

## Architecture

### Shared task-argument contract

Add a small orchestration contract module that owns the observed requirement:

```ts
export const SAVE_MEMORY_ORCHESTRATOR_ARGS_CONTRACT = Object.freeze({
  intent: "save_memory",
  requiredNonEmptyStringFields: Object.freeze(["content"] as const),
});
```

The module exposes:

```ts
export type OrchestratorTaskArgsIssue = Readonly<{
  code: "required_non_empty_string";
  field: "content";
  intent: "save_memory";
  taskIndex: number;
}>;

export const validateOrchestratorTaskArgs = (
  output: OrchestratorOutput,
): Readonly<{
  valid: boolean;
  issues: readonly OrchestratorTaskArgsIssue[];
}>;

export const renderOrchestratorTaskArgsProtocol = (): string;
```

Only `save_memory.content` is specialized in this phase. This keeps the repair
traceable to the observed failure instead of inventing an unreviewed parallel
schema for every intent.

The prompt renderer and runtime validator consume the same frozen contract.
`orchestratorPlanToIntent()` and `parseAgentIntentResult()` remain the final
business parser and provide defense in depth.

### Runtime Structured Output refinement

Create an Orchestrator runtime schema by refining the existing
`orchestratorOutputSchema`. For each validation issue, add a Zod issue at:

```text
tasks.<taskIndex>.args.content
```

The base model schema remains `orchestratorOutputBaseSchema`, preserving the
validated DeepSeek `prompt_json/jsonMode` transport. The refined runtime schema
is the final post-JSON contract passed to `invokeStructured()`.

This changes the observed failure from false `success` to a normal Structured
Output schema violation. No Provider task reaches decision consistency,
Query Scope, Resource Readiness, Mapper, or the business pipeline until the
refined schema passes.

### Prompt protocol

`buildLangChainSystemPrompt()` appends the string returned by
`renderOrchestratorTaskArgsProtocol()`. The generated text must state:

```text
save_memory: args.content is required and must be a non-empty string.
```

The field name and requirement must be rendered from
`SAVE_MEMORY_ORCHESTRATOR_ARGS_CONTRACT`; they must not be duplicated as an
independent hard-coded Prompt rule.

The protocol may explain that `title`, `type`, and `confidence` remain governed
by the existing business parser, but this phase must not make currently
optional fields newly required.

### One bounded repair retry

Extend `invokeStructured()` with an opt-in schema-repair instruction callback.
The callback receives only `StructuredOutputDiagnostics["issues"]`, whose
contents are already limited to:

- issue code;
- field path;
- whether the field was missing.

It cannot receive raw output or parsed values.

On a retryable schema failure:

1. emit the existing sanitized failed-attempt event;
2. build one deterministic system repair message;
3. append that message only to the next schema attempt;
4. retry through the same `invokeStructured()` call.

The Orchestrator repair message may name only the allowlisted path
`tasks.<index>.args.content` and require a complete JSON object. Unknown paths
receive a generic schema-repair instruction without field values.

The retry remains part of one Orchestrator logical call. Provider attempts keep
their existing monotonically increasing attempt numbers and remain visible to
the model-call recorder and production Gate.

`maxSchemaRetries` remains the hard bound. The live evaluation profile changes
from `0` to `1` so the Gate measures the same behavior intended for production.
Transport retries remain unchanged.

## Data Flow

```text
User message + untrusted workspace context
  -> protocol with generated save_memory args requirement
  -> DeepSeek JSON-mode response
  -> existing base/strict schema
  -> shared save_memory args refinement
     -> valid: continue to decision consistency
     -> invalid and retry available:
          sanitized issue path -> one repair instruction -> second attempt
     -> invalid and retry exhausted:
          typed schema failure -> unavailable
  -> decision consistency
  -> DAG
  -> Query Scope
  -> Resource Readiness
  -> Mapper
```

No invalid task arguments can cross the refinement boundary.

## Error and Safety Behavior

### First attempt invalid, second valid

- final Orchestrator result may be successful;
- logical Orchestrator calls remain `1`;
- Provider attempts become `2`;
- the first completed response remains in the strict-schema denominator;
- the sanitized failed-attempt event retains only issue code/path/missing;
- no raw Provider output is retained.

### Both attempts invalid

- return the existing typed `schema_failure`/retry-exhausted result;
- do not reinterpret the intent;
- do not synthesize `content`;
- do not call Legacy;
- do not reach Resource Readiness, Mapper, Draft, database, or execution.

### Retry disabled

With `maxSchemaRetries = 0`, the first argument violation returns the same typed
failure immediately. This keeps deterministic tests able to prove the hard
boundary independently of retry behavior.

## Evaluation and Metrics

The existing Gate already records:

- logical calls;
- Provider attempts;
- completed structured responses;
- strict-schema passes;
- sanitized schema issues;
- latency per ended attempt.

Therefore a successful retry cannot hide the first invalid response:

- business usability may recover;
- Provider attempts exceed logical calls;
- strict-schema rate includes the invalid completed response;
- the sanitized failed-attempt event remains in the report.

Add a bounded aggregate diagnostic `schemaRepairAttempts` derived only from
failed Provider-protocol events with `retryScheduled=true`. It is diagnostic,
not a replacement for strict-schema rate and not an exemption from any Gate.

Do not lower:

- semantic or usable rate thresholds;
- strict-schema threshold;
- transport threshold;
- timeout threshold;
- any zero-tolerance safety threshold.

Because the evaluation config changes, its deterministic config hash must also
change. Every future Provider approval must bind to the new implementation HEAD
and new hash.

## Deterministic Tests

Tests must be written and observed failing before production changes.

1. The generated Prompt contains the `save_memory.content` contract.
2. Prompt rendering and validation consume the same frozen contract.
3. Valid non-empty `content` passes the refined schema.
4. Missing, empty, whitespace-only, and non-string `content` fail at the exact
   bounded field path.
5. An unrelated intent is not assigned a new argument requirement.
6. One invalid response followed by a valid response uses one logical call and
   two Provider attempts.
7. The second attempt receives only sanitized issue paths, never raw values.
8. Two invalid responses return typed schema failure.
9. `maxSchemaRetries=0` performs no second attempt.
10. Invalid task arguments never reach decision consistency, Resource
    Readiness, Mapper, Draft, persistence, database, or execution.
11. Production evidence counts the repair attempt and retains the first
    strict-schema failure.
12. Existing Query Scope and Resource clarification behavior remains unchanged.
13. Legacy remains the default Runtime.

Run the existing focused orchestration, Provider-protocol, production-Gate,
typecheck, Agent, planning, schedule, content, and lint baselines after the
focused tests pass.

## Live Validation Sequence

No live call is authorized by this design.

After deterministic verification:

1. Run a no-network focused preflight for `wrt-3`.
2. Obtain explicit approval for a small fresh `wrt-3` Provider run.
3. Require first-attempt argument validity to be reported separately from final
   post-retry usability.
4. If the focused run passes, run a new Acceptance 33 bound to the changed HEAD
   and config hash.
5. Only a passing Acceptance 33 may authorize another Stability 99.

The previous Acceptance and Stability reports remain immutable evidence and
must not be overwritten.

## Acceptance Criteria

- `save_memory.content` is rendered from one frozen repository contract.
- Missing/empty/wrong-type content fails Structured Output validation.
- At most one schema-repair retry is possible in the live profile.
- Retry guidance contains only bounded issue paths and no raw values.
- One logical call invariant is preserved.
- Every Provider attempt remains counted.
- First-attempt schema failure remains visible in strict-schema metrics.
- Invalid arguments never reach downstream business boundaries.
- No deterministic synthesis of `content`.
- No Legacy fallback.
- No Prompt, response, reasoning, secret, or workspace value retention.
- All deterministic suites pass.
- Default Runtime remains Legacy.
- No Provider call occurs until a new HEAD/hash-specific approval is granted.
