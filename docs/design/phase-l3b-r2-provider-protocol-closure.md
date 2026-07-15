# Phase L3-B-R2 Provider Protocol Closure

## Status

Approved implementation design. The user-provided Phase L3-B-R2 brief is the
authoritative scope and Provider authorization for this design.

Baseline:

- Branch base: `aad4c03e54e34c1d5e23f72e2398b85dd41edd03`
- Default Orchestrator runtime: Legacy
- R1 targeted evidence: 15 requests, 2 strict-schema passes, 13 collapsed
  `provider_protocol` failures
- Provider: DeepSeek `deepseek-v4-pro` through the standard OpenAI-compatible
  chat-completions endpoint

## Goals

1. Separate Provider response receipt from JSON, base-schema, strict-schema,
   and semantic success.
2. Preserve only bounded, typed, payload-free diagnostics.
3. Make the `prompt_json` path parse the Provider's original JSON object and
   run the final strict schema before any non-strict transform can strip keys.
4. Exercise the real OpenAI-compatible envelope through the installed SDK and
   LangChain adapter without network access.
5. Re-run the staged Live Gate only after the deterministic protocol contract
   is green.

## Non-goals

- Runtime adoption or default changes
- Legacy removal
- Router, Executor, Policy Guard, confirmation, receipt, rollback, Payload
  schema, migration, checkpoint, Planning, or Schedule changes
- JSON repair, decision inference, missing-field synthesis, or schema
  weakening
- Raw prompt, response, content, reasoning, tool arguments, workspace data,
  credentials, headers, cookies, or resource identifiers in diagnostics

## Considered approaches

### A. Explicit `prompt_json` parsing on top of LangChain transport — selected

Use the existing `BaseChatModel` and `model.invoke()` with
`response_format={type: "json_object"}`. A request-scoped safe fetch observer
derives envelope state without retaining the body. SunnyPanel then extracts a
whole JSON object or one whole fenced JSON block, calls `JSON.parse`, validates
the raw parsed object with the base schema for diagnostics, and validates the
same raw object with the final strict schema.

This keeps the current LangChain model/config/test injection boundary while
making every parser stage observable.

### B. Keep `withStructuredOutput({ includeRaw: true })` — rejected

This exposes an AI message but still places the SDK envelope and parser failure
inside LangChain. It does not reliably distinguish missing/empty choices and it
does not by itself prevent a non-strict parser from normalizing away extra
fields.

### C. Call the OpenAI SDK directly — rejected

This gives full envelope control but creates a second transport abstraction,
bypasses the established LangChain model factory, and broadens the migration
surface unnecessarily.

## Architecture

### Safe envelope observation

`model-factory.ts` accepts an optional request-scoped safe response observer.
Only when that observer is supplied, the OpenAI client receives a fetch wrapper.
The wrapper clones a non-streaming response, derives only:

- response received and HTTP status class
- choices missing, empty, or present
- content missing, empty, or present
- bounded content length
- reasoning and tool-call presence booleans
- normalized finish reason

The clone, parsed envelope, content, reasoning, tool arguments, headers, and
error payload are local temporaries and are never returned, logged, or stored.
The original `Response` is returned unchanged to the SDK.

### Safe protocol state

Each attempt starts with an immutable default diagnostic object and advances
monotonically through these substages:

```text
not_started
→ content_extraction
→ json_extraction
→ json_parse
→ base_schema
→ strict_schema
→ semantic_validation
→ completed
```

The public diagnostic object contains only the fields approved in the phase
brief. A closed `StructuredProtocolFailure` subtype identifies the first failed
stage while the compatible upper failure reason remains `provider_protocol`.

### Observer events

The observer contract is stage-based:

```text
providerRequestStarted
providerResponseReceived
contentExtracted
jsonParsed
baseSchemaValidated
strictSchemaValidated
semanticValidationCompleted
failed
```

`providerResponseReceived` means an HTTP response was actually observed. A
structured parse or strict-schema result is never counted as transport success.
The Orchestrator emits the semantic event after decision-consistency validation;
DAG and Resource Guard remain separate existing safety gates.

### Explicit JSON parsing

The `prompt_json` path accepts only:

1. a trimmed complete JSON object; or
2. a trimmed single complete Markdown JSON fence containing one JSON object.

It rejects leading/trailing prose, multiple objects, arrays, incomplete JSON,
reasoning-only results, tool-arguments-only results, and any repair attempt.

Validation order is:

```text
JSON.parse(candidate)
→ modelSchema.safeParse(rawObject)      # diagnostic only; data discarded
→ finalStrictSchema.safeParse(rawObject) # authoritative result
```

The strict schema therefore sees the original parsed keys and rejects extras.
Native JSON Schema and function-calling strategies keep their existing
`withStructuredOutput()` path.

## Error classification

The first applicable subtype wins:

- missing/empty choices or unusable body → `provider_response_envelope_invalid`
- missing content → `provider_missing_content`
- empty content → `provider_empty_completion`
- reasoning without final content → `provider_reasoning_only`
- tool calls without final content → `provider_tool_arguments_only`
- `finish_reason=length` → `provider_truncated`
- unexpected terminal finish → `provider_finish_reason_unexpected`
- non-object/non-whole JSON shape → `provider_json_extraction_failed`
- `JSON.parse` failure → `provider_json_parse_failed`
- base Zod failure → `provider_base_schema_failed`
- final strict Zod failure → `provider_strict_schema_failed`
- unsupported normalized message shape → `provider_adapter_normalization_failed`

HTTP authentication, rate-limit, server, network, cancellation, and timeout
errors remain transport/model errors and retain safe envelope diagnostics when
an HTTP response was observed.

## Evaluation metrics and sanitizer

The harness separately counts:

- Provider requests
- Provider responses received
- structured JSON parses
- base-schema passes
- strict-schema passes
- semantic validations completed
- semantic comparable outputs
- semantic correct outputs

Each observation may retain a bounded array of safe attempt diagnostics. The
sanitizer permits only the exact diagnostic keys with exact boolean/enum/number
value contracts. Similar keys such as `response`, `content`, `reasoning`,
`toolArguments`, or headers remain forbidden at every nesting depth.

## Provider configuration baseline

Official DeepSeek documentation states that thinking defaults to enabled, can
be disabled with `thinking.type=disabled`, that JSON mode should include a
format example, and that `max_tokens` should be bounded to avoid truncation.

Before the first R2 targeted run the evaluation-only model config freezes:

- structured mode: `prompt_json` / `json_object`
- thinking: `disabled`
- orchestrator output budget: `4096` tokens
- timeout: `30_000` ms
- LangChain retry: `0`
- evaluation transport retry: `1`
- schema retry: `0`
- temperature: `0.1` (recorded, although disabled thinking makes it effective)

The 4,096-token budget is bounded while comfortably exceeding the expected
one-to-eight-task synthetic protocol output. Prompt wording remains unchanged
for the first run. Subsequent targeted iterations change one main variable per
commit and run.

## Deterministic test design

The real-envelope suite replaces global fetch only within each test and sends
synthetic OpenAI-compatible envelopes through the actual installed OpenAI SDK,
LangChain `ChatOpenAI`, content extraction, explicit parser, and Zod schemas.
It covers all 25 success/failure cases required by the phase brief, including
HTTP classes, timeout, empty choices, reasoning-only, tool-only, truncation,
enum/type/required/extra failures, and adapter normalization.

Every failure asserts the upper error code, protocol subtype, safe stage state,
and absence of forbidden retained fields. Existing normalized-object unit tests
remain as lower-level retry and compatibility coverage.

## Live Gate sequence

After focused and full deterministic verification:

1. Freeze branch, HEAD, prompt/schema/config hashes, fixtures, rounds, model,
   structured mode, output budget, thinking, timeout, and retries.
2. Run exactly the approved five fixtures for three rounds.
3. If targeted fails, stop and use only sanitized diagnostics; apply at most
   one evidence-supported variable change before the next targeted run.
4. Stop after at most three targeted runs.
5. Only a passing targeted run may unlock acceptance 33.
6. Only a passing 33 may unlock six isolated known-ID diagnostics.
7. Only passing 33 plus six diagnostics and its accepted config hash may unlock
   fresh stability 99.

No Live report is committed. No Provider output is printed. Database access is
unset, credentials are process-local from Keychain, and Legacy remains default
regardless of the result.

## Docs reviewed

- `CLAUDE.md`: protected Agent workflow, docs gate, test and completion rules
- `docs/product-map.md`: Agent Workbench and no-direct-write boundary
- `docs/feature-index.md`: protected runtime and safety surface
- `docs/agent-workflow-v1.md`: read/write and execution boundaries
- `docs/safety-model.md`: secret and raw Provider data prohibitions
- `docs/system-architecture.md`: existing Agent runtime dependency direction
- `docs/testing-strategy.md`: deterministic and protected test layers
- `tests/TEST_MAP.md`: L3-B protected contracts and suite ownership
- L3-B-R1 design, plan, baseline, Task 7, and final rereview evidence

## Docs conflicts

None. The design changes only the experimental structured-output transport and
evaluation layers and preserves every protected execution and runtime boundary.
