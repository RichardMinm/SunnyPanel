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

Known-ID behavior is verified separately by deterministic tests and explicit
diagnostic Provider probes. These probes provide `planId=101`, expect a
write-candidate with that exact ID, and are reported outside the 99-observation
gating denominator. They cannot improve or dilute the gating result.

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

Conversational answers use an answer-only output budget. The answer model is
asked for a direct response of at most four short paragraphs and receives a
bounded maximum output-token setting. The limit applies only to the answer
renderer; it does not silently truncate Orchestrator structured output or
specialist calls. A Provider stream that violates existing terminal contracts
still returns typed `unavailable` or `incomplete` and is not persisted as a
complete answer.

## Provider retry and accounting

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

The harness reports every actual Provider attempt. A recovered retry therefore
increases `providerRequests` and `apiCalls`; it is not hidden as one call. One
authoritative observation still means one Orchestrator service invocation.

## Evaluation data flow

For each gating observation:

1. Build the restored sanitized fixture context.
2. Record one authoritative Orchestrator service scope.
3. Invoke structured output with fixed retry and timeout budgets.
4. Validate strict Zod schema, DAG, and deterministic resource readiness.
5. Compare only schema-valid usable candidates for semantic mismatch rates.
6. Count independent unsafe transitions even when the resource guard blocks the
   candidate.
7. Invoke the answer renderer only for `answer_question`.
8. Aggregate sanitized counters and latency distributions only.

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
10. every real structured Provider attempt is counted, including retry;
11. schema retry remains zero in Live evaluation;
12. answer-only output budget does not affect Orchestrator model construction;
13. complete/unavailable/incomplete persistence contracts remain unchanged;
14. default runtime remains Legacy;
15. task execution and database mutation remain unreachable from the harness.

The full deterministic baseline remains typecheck, Agent tests, planning,
schedule, content, lint, typography, and `git diff --check`.

## Live validation sequence

Live validation is staged to minimize cost without weakening evidence:

1. Run the 33-fixture single-round acceptance matrix.
2. Run the separate known-ID diagnostic probes and report them separately.
3. Stop immediately if an unsafe gate fails.
4. If acceptance is safe, run three fresh consecutive rounds for 99 gating
   observations.
5. Apply the existing L3-B safety, availability, fixture coverage, and latency
   thresholds without modification.

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
