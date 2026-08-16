# Query Runtime v1

## Status

| Item | Status |
| --- | --- |
| Implementation | complete |
| Deterministic verification | passed |
| Admin limited adoption evaluation | passed |
| Default runtime | `legacy` |
| Default adoption | `off` |
| Production-wide adoption | not enabled |
| Legacy removal | not authorized |

This is a guarded, read-only adoption path. It does not replace the Router, does not make LangChain the default Query runtime, and does not authorize wider production adoption. The implementation is in `src/lib/agent/query`; the production seam accepts commentary only for a deterministic Boundary-owned `preResolvedIntent` whose `orchestratorPlanSource` is exactly `heuristic`. LLM-, null-, or unknown-source plans are forced to `legacy/off` before Query facts or Provider work.

## Query Ownership

Every active Query intent has exactly one owner:

| Intent | Ownership |
| --- | --- |
| `query_progress`, `query_plan_progress` | `LANGCHAIN_ENHANCED` — deterministic canonical facts with optional qualitative commentary |
| `capability_query`, `query_checklist_progress`, `query_memory`, `query_plan`, `query_schedule`, `query_timeline` | `DETERMINISTIC` |
| `evaluate_plan` | `NOT_PURE_READ` |

The executable inventory is `ACTIVE_QUERY_OWNERSHIP`; `ACTIVE_LEGACY_QUERY_MODEL_CALLS` is locked to `0`. The compatibility runtime name `legacy` remains a kill-switch value, but it does not represent an active Legacy Query model owner.

## Supported Scope

Only these exact variants are eligible when both runtime gates and the trusted actor check pass:

- `query_progress`
  - `scope: "all"`
  - `scope: "plans"`
  - `scope: "checklists"`
  - missing `scope`, which has the same canonical output semantics as `all`
  - no checklist title filter; `checklistTitle` may be absent or `null`, while an empty or non-empty string is rejected
- `query_plan_progress`
  - one positive integer `planId`
  - no aliases or extra arguments

The exact decision is implemented by `decideAdminQueryAdoption()` in `src/lib/agent/query/admin-adoption.ts`; the named intent list is `LANGCHAIN_QUERY_INTENTS` in `src/lib/agent/query/types.ts`. Tests lock the accepted and rejected shapes in `tests/agent/query-admin-adoption.test.ts` and `tests/agent/query-langchain-runtime.test.ts`.

## Explicit Exclusions

The following remain on their existing paths:

- `answer_question`: the Primary may already contain an answer; another Query model call would duplicate work.
- `query_checklist_progress`: its context and Legacy semantics were not admitted to the parity-confirmed allowlist.
- `query_schedule`: it already has a dedicated stable read path.
- `evaluate_plan`: it is not treated as a pure read migration target and can involve business persistence.
- title-only `query_plan_progress`: resource selection by title is not eligible.
- `query_progress` with `checklistTitle`: filtered checklist variants are not eligible.
- compound queries: ordering and mixed-intent behavior are outside this runtime.
- all write intents: the Query runtime has no write authority.
- aliases or argument shapes that do not exactly satisfy eligibility.

These exclusions avoid repeated Primary model work, unverified semantic baselines, resource-selection ambiguity, business persistence, and expansion beyond the read-only boundary. A rejected gate is compatibility behavior, not a Query runtime error.

## Runtime Configuration

`src/lib/agent/query/runtime-config.ts` resolves configuration dynamically per request:

| Variable | Accepted enabled value | Any other or missing value |
| --- | --- | --- |
| `AGENT_QUERY_RUNTIME` | `langchain` | `legacy` |
| `AGENT_QUERY_ADOPTION` | `admin` | `off` |

Both values must be enabled for adoption. Values such as `on`, `true`, different casing, or padded strings do not enable adoption. Commentary timeouts default to 8 seconds for first text and 30 seconds total, with bounded configuration ceilings of 12 and 45 seconds respectively. These timeout settings affect optional commentary, not canonical fact generation.

## Trusted Actor Boundary

The eligible actor is a **trusted single-user admin actor** derived from the Payload server authentication result. The API rejects an unauthenticated request before calling the agent handler; the production seam derives `isAdmin` from the authenticated server user collection.

Client-provided `isAdmin`, role fields, headers, or message content do not participate in this decision. SunnyPanel currently has no independent role model or fine-grained RBAC here. This gate is therefore not a multi-user authorization system; it is a default-deny adoption boundary for the current single-user admin model. The source-regex and behavior contracts are in `tests/agent/query-admin-adoption.test.ts`.

## Eligibility Contract

The gate order is fixed:

1. the intent must be owned by the deterministic Boundary (`source=heuristic`);
2. runtime must be `langchain`;
3. adoption must be `admin`;
4. the server-derived actor must be trusted;
5. the intent must be exactly allowlisted;
6. arguments must match the exact eligible shape.

Rejection occurs before the new facts loader and before the Query Provider. Rejection reasons are sanitized categories such as `runtime_legacy`, `adoption_disabled`, `actor_not_admin`, `intent_not_eligible`, and `argument_shape_not_eligible`. The gate does not mutate the Primary intent.

## Data Flow

```text
Deterministic Boundary-owned preResolvedIntent
→ Ownership Gate
→ Runtime / Adoption Gate
→ Trusted Actor Check
→ Exact Intent / Args Eligibility
├─ Rejected
│  → Existing deterministic / domain-owned path
└─ Adopted
   → Shared QueryFacts Loader
   → Deterministic Canonical Answer
   → Enum-only Qualitative Projection
   → Provider Input Audit
   → Buffered Provider Commentary
   → Local Validation
      ├─ Accepted
      │  → Canonical + Commentary
      └─ Omitted
         → Canonical Only
   → Existing Conversation Persistence
   → done
```

The production insertion point is `dispatchPreResolvedQuery()` before the existing conversational and business workflow continuation. No new LangGraph node, checkpoint state, Payload collection, or migration was added.

## QueryFacts

`QueryFacts` is a discriminated union of aggregate progress facts and plan progress facts in `src/lib/agent/query/types.ts`. A request-time deterministic repository loader in `src/lib/agent/query/facts-repository.ts` reads current Payload data and uses the builders in `src/lib/agent/query/facts.ts`.

Contracts:

- Legacy formatting and the guarded LangChain path consume the same loaded fact semantics.
- The Provider does not calculate counts, division, percentages, due-date bands, visibility, or resource matching.
- Each adopted turn invokes its facts loader at most once.
- Formatters and projections do not reread the database.
- `QueryFacts` is not stored in the evaluation report.
- Raw `QueryFacts` is not sent to the Provider.
- Missing plan facts produce a deterministic clarification and no Provider call.

Parity and single-load behavior are protected by `tests/agent/query-langchain-runtime.test.ts`, `tests/agent/query-qualitative-projection.test.ts`, and `tests/agent/query-admin-adoption.test.ts`.

## Canonical Answer

`renderCanonicalFactBlock()` in `src/lib/agent/query/langchain-query-agent.ts` renders the authoritative fact block before optional commentary. Aggregate facts use deterministic plan and checklist counts; plan facts use the loaded plan state, stored progress, phase count, and task count.

The canonical answer is complete without the Provider. Composition in `src/lib/agent/query/qualitative-projection.ts` always keeps the canonical block first and appends commentary only after local acceptance. The Provider cannot modify or replace canonical facts.

## Qualitative Projection

`projectQualitativeQueryFacts()` deterministically maps raw facts to a frozen enum-only projection. It deliberately uses `unknown` where the implementation does not have an admitted qualitative derivation. The projection is expression support, not a second fact source.

Aggregate projection fields:

- `kind`
- `activityBand`
- `progressBand`
- `deadlineBand`
- `workloadBand`
- `attentionBand`

Plan projection fields:

- `kind`
- `stateBand`
- `progressBand`
- `deadlineBand`
- `workloadBand`
- `attentionBand`

Allowed values are shared constants in `src/lib/agent/query/qualitative-projection.ts`; tests assert enum-only, immutable output.

## Provider Input Boundary

The Provider sees only:

1. the static qualitative system protocol; and
2. the exact serialized enum-only projection above.

`auditQualitativeProviderInput()` checks roles, message count, static protocol, exact serialized data, exact keys, and enum membership before any model call.

The Provider does not receive the user question, `planId`, `checklistId`, titles, goals, phases, checklist items, `openItems`, counts, percentages, dates, raw `QueryFacts`, canonical answer, `AgentPromptContext`, thread summary, memory, workspace text, secrets, or hidden reasoning. Tests in `tests/agent/query-qualitative-projection.test.ts` and both evaluation suites lock this boundary.

## Commentary Validation

The runner in `src/lib/agent/query/qualitative-commentary.ts` buffers the entire Provider stream. Reasoning blocks are ignored; a tool call, numeric text, invalid structure, overflow, timeout, or Provider failure prevents commentary acceptance. Nothing is streamed to the user until local validation completes.

Accepted commentary must be one short natural-language qualitative sentence. The validator rejects empty output, excessive length, structured content, Markdown, multiple sentences, numeric content, resource references, execution claims, and unsafe escalation. Accepted text is appended after the canonical answer. Rejected text is omitted in full.

## Persistence Boundary

An adopted query with facts returns `complete` even when commentary is omitted. The existing production seam persists exactly the final composed assistant message through `persistAgentTurn()`. A missing plan returns a deterministic `clarify`, which is also persisted through the existing conversation path.

There is no partial-commentary persistence. Buffered validation means a failed commentary contributes no user-visible text. Canonical-only completion uses normal persistence and the normal done event. The Query path does not create a Draft, dry-run, confirmation, execution record, Receipt, or Rollback.

## Observability

`src/lib/agent/query/admin-adoption-observer.ts` holds a bounded in-process collector of at most 200 sanitized observations. It records categories, bounded latency, call counts, result state, and omission reason. It excludes user messages, titles, IDs, facts, canonical text, commentary text, prompts, responses, tokens, secrets, and reasoning.

The collector is non-durable and is not an enterprise audit log. It is process-local evaluation and operational evidence only. The live report is aggregate-only and does not persist raw prompts, responses, facts, or user content.

## Failure and Degradation

### Gate rejected

- Continue the existing deterministic or domain-owned path.
- Do not invoke the new `QueryFacts` path.
- Do not call the Query Provider.

### Facts missing resource

- Return deterministic clarification.
- Do not call the Provider.

### Commentary timeout, error, or validation failure

- Complete the query with the canonical answer only.
- Persist the canonical-only answer normally.
- Emit normal completion rather than a user-visible Provider error.
- Do not run Legacy after Provider start.
- Do not perform a second facts read.

### Runtime or adoption disabled

- The next request received by the current service process follows Legacy.
- No restart-time cached enablement is required by the resolver.

An oversized canonical or projection block degrades before Provider start by formatting the already loaded facts through the existing deterministic format. It does not perform another database read.

## Kill Switches

Either switch independently prevents adoption:

```text
AGENT_QUERY_ADOPTION=off
AGENT_QUERY_RUNTIME=legacy
```

The safe default is both values above. The deterministic and live rollback drills verify that a disabled switch produces the Legacy outcome with zero facts-loader and Provider calls on the guarded path.

## Test Evidence

- `tests/agent/query-langchain-runtime.test.ts`: fact parity, default runtime, exact scope, canonical rendering, one-load behavior, oversized pre-Provider degradation, Primary immutability, and exclusions.
- `tests/agent/query-qualitative-projection.test.ts`: enum projection, input audit, buffered output, tool/numeric rejection, canonical-first composition, persistence, and omission.
- `tests/agent/query-langchain-evaluation.test.ts`: fixed sanitized fixture and safety metric contracts.
- `tests/agent/query-admin-adoption.test.ts`: default-off adoption, trusted actor, exact gate, dual switches, bounded observations, no mutation, and no duplicate calls.
- `tests/agent/query-admin-adoption-evaluation.test.ts`: 30+10 matrix, independent safety failures, latency/product gates, aggregate-only report, and explicit live opt-in.

Real Provider evaluation is manual-only and is not part of default CI.

## Historical Limited-adoption Live Evidence

The following 40-observation run predates the Boundary ownership closure and the
default-activation gate. It remains valid evidence for the enum-only commentary
contract, but it does not prove the current ownership wiring or a new default.

The final admin limited-adoption run used DeepSeek V4-Pro and completed 40 observations:

- real admin observations: 30; synthetic observations: 0; negative controls: 10;
- adopted / rejected: 30 / 10;
- adopted aggregate / plan: 15 / 15;
- canonical complete: 30/30; canonical fact mismatch: 0;
- commentary accepted / omitted: 30 / 0;
- rejection distribution: `actor_not_admin=2`, `intent_not_eligible=4`, `argument_shape_not_eligible=4`;
- all Provider-input, invented-resource, prompt-injection, unsafe-escalation, execution-claim, partial-output, hidden-fallback, mutation, unexpected-persistence, user-visible-error, and duplicate-call metrics: 0;
- maximum facts-loader calls per observation: 1;
- expected persistence: 30; unexpected persistence: 0;
- limited-adoption observed canonical latency P50 / upper tail: 14 ms / 29 ms;
- limited-adoption observed Provider latency P50 / upper tail: 3228 ms / 7862 ms;
- limited-adoption observed commentary-added latency P50 / upper tail: 3228 ms / 7862 ms;
- limited-adoption observed final latency P50 / upper tail: 3241 ms / 7871 ms;
- API calls: 30;
- Provider usage: N/A — Provider did not return usable usage metadata;
- Provider cost: N/A — Provider did not return usable cost metadata;
- runtime and adoption rollback drills: passed.

These figures are observed limited-adoption data, not a production SLA and not evidence for every Provider.

## Current Limitations

- Defaults remain `legacy` and `off`.
- Only two exact read variants are eligible.
- Positive plan queries require a known positive integer ID.
- Provider upper-tail latency was approximately eight seconds in the limited run.
- Commentary may be omitted; it is not a guaranteed product feature.
- The observation collector is bounded, process-local, and non-durable.
- The actor model is single-user admin, not multi-user RBAC.
- Not all Query intents are supported.
- Legacy remains required.
- No formal production SLA is claimed.

## Non-goals

- Router adoption or default Router replacement
- Query allowlist expansion
- write or compound migration
- Provider-based fact calculation or resource selection
- multi-user RBAC or enterprise audit compliance
- new LangGraph nodes, checkpoint state, Payload collections, or migrations
- Legacy removal
- external system rollback or distributed transactions

## Rollback

Operational rollback is immediate and independent:

```text
AGENT_QUERY_ADOPTION=off
AGENT_QUERY_RUNTIME=legacy
```

Git rollback must use `git revert`, not destructive reset. Revert the closure showcase commit first, then the closure technical-doc commit. If C2 itself must be reverted after its no-ff merge, revert that merge separately with `git revert -m 1 <merge-commit>`.
