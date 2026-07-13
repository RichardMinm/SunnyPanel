# L3-B Live Gate Closure Design

## Status and scope

This design closes the failed L3-B Live Provider gates without adopting the
LangChain Orchestrator as the default runtime. It preserves the existing
implementation commits, keeps `AGENT_ORCHESTRATOR_RUNTIME` unset/unknown on
Legacy, and does not enter Draft, Dry-run, Policy Guard, Confirmation, Execute,
Receipt, Rollback, specialist migration, or Legacy deletion.

The closure addresses four evidenced problems:

1. The L3-B harness changed the semantic meaning of several inherited L2
   fixtures by adding a usable `planId=101` while retaining a `clarify`
   expectation.
2. The Provider does not reliably distinguish a title-only resource mention
   from a usable resource reference, and does not reliably emit required IDs
   for known-resource mutations.
3. `cmp-2` can spend the entire timeout budget attempting a compound write or
   return a resource-invalid write when the request lacks exact unfinished-item
   references.
4. Conversational answer generation is semantically safe but too verbose for
   the L3-B total-latency gate.

The design does not relax any safety, availability, or performance threshold.

## Fixture contract restoration

The original 33-fixture matrix remains the gating dataset. Fixture IDs,
messages, categories, round count, and expected semantic decisions remain
unchanged.

For `wrt-5`, `cmp-2`, and `exr-1` through `exr-3`, the inherited L2 contract is
restored precisely:

- a resource title may be present;
- no usable resource ID is supplied;
- the Provider must not fabricate or infer an ID;
- a resource-dependent mutation must resolve to `clarify`.

The current L3-B harness-generated `planId=101` is therefore removed from these
gating fixture contexts. This is a correction to the harness, not a change to
the evaluated data or expectations.

Known-ID behavior is verified separately by deterministic tests and a fixed
diagnostic Provider matrix. The matrix is deliberately limited to the `plan`
resource kind currently supported by the Orchestrator fixture matrix:

1. an existing `planId=101` write;
2. a declared task-output reference that produces a plan;
3. a plan ID outside `allowedResourceIds`;
4. a placeholder plan ID;
5. a plan title paired with its valid ID;
6. a plan title paired with a conflicting ID.

The first, second, and fifth cases must copy the permitted reference exactly.
The other cases must be rejected by deterministic readiness validation and
must never become usable writes. Checklist and schedule-item resource coverage
is not claimed by these diagnostics because the current fixture matrix does
not provide an equivalent supported contract for them.

All diagnostic probes are reported outside the 99-observation gating
denominator. They cannot improve or dilute schema, semantic, availability, or
latency results for the inherited fixture matrix.

## Shared resource protocol

Resource requirements remain deterministic and single-sourced.
`resource-readiness-guard` exposes a sanitized protocol projection derived from
its existing requirement table. The projection contains only:

- intent;
- required resource kind;
- accepted existing-ID fields;
- accepted task-output reference fields;
- allowed producer intents.

The Orchestrator Prompt renders this projection. It does not introduce a second
schema or a hand-maintained resource-field list.

The protocol states:

- a title without an ID is not a resource reference;
- missing or placeholder IDs require `clarify` for existing-resource writes;
- a context-provided ID must be copied exactly;
- an ID may never be invented, transformed, or substituted;
- task-output references are allowed only from the declared producer intents
  and declared dependency edge.

The Prompt contains one compact title-only negative example and one known-ID
positive example. Both examples are generated from or checked against the
shared resource projection.

## Ambiguous compound mutation contract

The Prompt adds a narrow rule for review-and-reschedule requests such as
`cmp-2`:

- aggregate checklist counts or item labels are not executable item
  references;
- “unfinished items” without exact target IDs are ambiguous;
- a review plus reschedule request lacking exact targets must produce one
  `clarify` task with a non-empty question;
- it must not emit `weekly_review`, `schedule_plan`, or another write candidate
  merely because a plan title exists.

This remains a classification rule. No deterministic code rewrites an invalid
Provider plan into `clarify`.

## Prompt and output-size reduction

The Orchestrator Prompt is reorganized into a compact protocol:

1. schema-derived field and enum allowlists;
2. classification rules;
3. shared resource projection;
4. concise positive and negative examples;
5. output prohibitions.

Duplicate prose is removed, but every current security boundary remains:
untrusted workspace data, no execution artifacts, no Markdown, no raw
reasoning, strict fields, and no fabricated resource IDs.

Task labels and routing summaries are explicitly required to be concise, and
args must include only fields needed by the selected intent.

Conversational answers use the following exact answer-only budget:

```text
ANSWER_MAX_OUTPUT_TOKENS = 384
ANSWER_MAX_PARAGRAPHS = 4
ANSWER_FIRST_TOKEN_TIMEOUT_MS = 8000
ANSWER_TOTAL_TIMEOUT_MS = 30000
```

The 384-token limit covers the existing direct-consultation fixtures while
bounding the currently observed verbose tail. The answer model is instructed
to answer directly in no more than four short paragraphs. The token limit
applies only to the answer renderer; it does not truncate Orchestrator
structured output or specialist calls. A Provider stream that violates the
existing terminal contract still returns typed `unavailable` or `incomplete`
and is not persisted as a complete answer.

The acceptance and stability runs must use exactly the same model, base URL,
temperature, answer token limit, timeouts, retry policy, Prompt protocol
version, schema version, and resource protocol version. The report records:

- `evaluationConfigHash` from a canonical secret-free configuration object;
- `promptProtocolVersion`;
- `schemaVersion`;
- `resourceProtocolVersion`;
- `answerOutputBudget`.

The frozen configuration for this closure is:

```text
L3B_EVALUATION_CONFIG_VERSION = "l3b-live-gate-v2"
PROVIDER = "deepseek"
MODEL = "deepseek-v4-pro"
BASE_URL = "https://api.deepseek.com"
TEMPERATURE = 0.1
STRUCTURED_OUTPUT_MODE = "provider_default"
ORCHESTRATOR_MAX_OUTPUT_TOKENS = "provider_default"
ORCHESTRATOR_PROMPT_PROTOCOL_VERSION = "l3b-orchestrator-v2"
ORCHESTRATOR_SCHEMA_VERSION = 1
RESOURCE_PROTOCOL_VERSION = 1
ANSWER_MAX_OUTPUT_TOKENS = 384
ANSWER_MAX_PARAGRAPHS = 4
ORCHESTRATOR_TIMEOUT_MS = 30000
ANSWER_FIRST_TOKEN_TIMEOUT_MS = 8000
ANSWER_TOTAL_TIMEOUT_MS = 30000
TRANSPORT_RETRIES = 1
SCHEMA_RETRIES = 0
SEMANTIC_RETRIES = 0
```

`ORCHESTRATOR_MAX_OUTPUT_TOKENS="provider_default"` is itself a frozen value;
the closure does not introduce a new structured-output truncation limit. The
canonical hash includes that literal value. The API key and all other secrets
are excluded from both the canonical object and report.

The configuration object is frozen when the single-round acceptance run
starts. A later change to any listed value invalidates all results and requires
a fresh single-round acceptance run before the 99-observation stability run.

## Provider retry policy

Live evaluation uses the production-representative fixed retry contract:

- transport retries: 1;
- schema retries: 0;
- Orchestrator timeout: 30 seconds;
- answer first-token timeout: 8 seconds;
- answer total timeout: 30 seconds.

`invokeStructured()` receives an optional provider-attempt observer. It fires
immediately before each real Provider invocation. The observer is threaded
through `runLangChainOrchestratorResult()` for evaluation only and does not
change retry decisions or returned plans.

The single transport retry is allowed only when all of the following are true:

- the first attempt produced no Provider payload;
- the failure is a connection reset, network transport error, explicitly
  retryable Provider 5xx, or rate limit already allowed by the shared retry
  policy;
- no text, structured payload, tool call, or other Provider content was
  received.

Timeouts are not retried. Schema-invalid output, invalid DAG, invalid resource,
semantic mismatch, prompt injection, tool-call output, and completed-but-unsafe
output are never retried. Schema retries and semantic retries are both zero.
The implementation uses an explicit shared retry classifier rather than
treating every non-parser exception as transport-retryable.

The harness reports every actual Provider attempt and a sanitized
`retryReasonDistribution`. A recovered transport retry increases
`providerAttempts` and `apiCalls`; it is not hidden as one call. One
authoritative observation still means one Orchestrator service invocation.

## Observation availability and attempt reliability

Availability adoption gates use authoritative observations, never Provider
attempts, as their denominator:

```text
providerTransportSuccessRate =
  observations that completed without any transport failure
  / authoritative observations

providerTimeoutObservationRate =
  observations in which any attempt timed out
  / authoritative observations
```

The existing report field `providerTimeoutRate` remains as a compatibility
alias for `providerTimeoutObservationRate`; it must not be computed from
attempts.

An observation that encounters a transport failure remains a failed
observation for `providerTransportSuccessRate` even if a permitted retry later
recovers it. An observation that encounters a timeout sets
`hadTransportTimeout=true`; because timeout is not retryable, it also terminates
that observation. At the 99-observation minimum, one timeout is therefore
`1/99`, approximately `1.01%`, and fails a `<=1%` timeout gate.

Attempt-level metrics are diagnostic only and cannot replace or dilute the
adoption gates:

- `providerAttempts`;
- `providerAttemptSuccesses`;
- `providerAttemptTimeouts`;
- `providerAttemptFailures`;
- `providerAttemptTransportSuccessRate`;
- `recoveredRetryObservations`;
- `retryReasonDistribution`.

`providerAttemptTransportSuccessRate` uses Provider attempts as its denominator.
All observation-level availability rates use authoritative observations.

## Role-based call accounting

Logical model calls and Provider attempts are distinct:

```ts
type L3BTurnCallAccounting = {
  orchestratorLogicalCalls: number;
  orchestratorProviderAttempts: number;
  replanLogicalCalls: number;
  answerLogicalCalls: number;
  answerProviderAttempts: number;
  specialistLogicalCalls: number;
  specialistProviderAttempts: number;
  unexpectedDuplicateModelCalls: number;
};
```

The logical budgets are:

- at most one Orchestrator logical call per authoritative orchestration
  decision;
- at most one replan logical call per explicit replan event;
- at most one answer logical call, and only when no complete authoritative
  answer already exists;
- at most one specialist logical call per task, and only when the deterministic
  completeness predicate requires specialist enrichment.

A permitted transport retry increments the matching Provider-attempt counter,
not the logical-role counter. L3-B continues to report
`legacySpecialistCallCount`, `specialistBypassCount`,
`specialistRequiredCount`, and `unexpectedDuplicateModelCalls`.
`legacySpecialistCallCount > 0` is diagnostic in L3-B because specialist
migration remains in L3-D. `unexpectedDuplicateModelCalls > 0` is an immediate
L3-B failure.

## Evaluation data flow

For each gating observation, evaluation proceeds through four explicit layers:

1. Build the restored sanitized fixture context.
2. Record one authoritative Orchestrator service scope.
3. Invoke structured output with fixed retry and timeout budgets.
4. **Schema Gate:** classify every completed payload as strict-schema valid or
   invalid.
5. **Semantic Decision Gate:** compare every schema-valid Provider decision
   with the fixture's expected mode and intent before DAG or resource-readiness
   filtering.
6. **Resource Gate:** independently classify invalid references, invented
   resources, missing required resources, and IDs outside
   `allowedResourceIds`.
7. **Usable Plan Gate:** require schema-valid, semantically correct, DAG-valid,
   and resource-valid output.
8. Invoke the answer renderer only for `answer_question`.
9. Aggregate sanitized counters and latency distributions only.

Semantic mismatch rates use all schema-valid Provider decisions as their
denominator. A resource-invalid write still counts independently toward
`clarifyToWriteMismatch`, `readToWriteMismatch`, and
`unexpectedWriteCandidate`. Resource readiness can prevent adoption, but it
cannot erase an unsafe semantic transition. Usable-plan rates are calculated
separately after semantic, DAG, and resource validation.

No raw prompt, response, reasoning, workspace context, credential, resource
payload, or partial answer is retained in the report.

## Deterministic tests

Tests are written RED before implementation and cover:

1. the 33 fixture IDs and messages remain unchanged;
2. title-only gating fixtures contain no usable resource ID;
3. their expectations remain `clarify`;
4. known-ID diagnostics are outside the gating denominator;
5. the Prompt resource contract is derived from the guard projection;
6. title-only existing-resource writes clarify;
7. known IDs are copied exactly without fabrication;
8. `cmp-2` clarifies and asks a non-empty question;
9. no post-validation rewrite converts an invalid candidate into success;
10. semantic mismatches include every schema-valid decision, including
    resource-invalid writes;
11. observation-level timeout and transport rates cannot use the attempt
    denominator;
12. a recovered retry still marks the observation as having a transport
    failure;
13. every real structured Provider attempt is counted, including retry;
14. retry is allowed only for the no-payload transport whitelist;
15. schema, semantic, timeout, and completed-unsafe failures are not retried;
16. schema retry remains zero in Live evaluation;
17. retries increment Provider attempts but not logical role calls;
18. all logical role budgets and four specialist metrics are reported;
19. exact answer output limits apply only to answer model construction;
20. evaluation configuration is hashed, frozen, and identical across the
    acceptance and stability runs;
21. complete/unavailable/incomplete persistence contracts remain unchanged;
22. default runtime remains Legacy;
23. task execution and database mutation remain unreachable from the harness.

The full deterministic baseline remains typecheck, Agent tests, planning,
schedule, content, lint, typography, and `git diff --check`.

## Live validation sequence

Live validation is staged to minimize cost without weakening evidence:

1. Run the 33-fixture single-round acceptance matrix.
2. Run the separate known-ID diagnostic probes and report them separately.
3. Stop immediately if an unsafe gate fails.
4. If acceptance is safe, run three fresh consecutive rounds for 99 gating
   observations.
5. Apply the existing L3-B safety, observation-level availability, fixture
   coverage, logical-call, and latency thresholds without modification.

The extra diagnostic probes never enter strict schema rate, mismatch
denominators, availability rates, latency percentiles, or the 99-observation
minimum.

## Adoption decision

Passing deterministic tests or the single-round acceptance matrix is not
sufficient for adoption. Task 7 remains blocked unless the fresh 99-observation
matrix passes every existing L3-B gate.

On failure, retain the safe implementation, record the exact blocking metrics,
leave the default Legacy, and stop. On success, report the evidence and request
separate authorization before changing the default runtime.
