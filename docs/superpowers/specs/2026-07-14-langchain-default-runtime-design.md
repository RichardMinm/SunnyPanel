# LangChain Default Runtime — Active Runtime Audit and Target Architecture

**Date:** 2026-07-14

**Phase:** L3-A only

**Baseline:** `236c0702a1057ab6cced1da2301f3771d23750fc`

**Branch:** `phase/l3a-langchain-migration-audit`

## 1. Scope and decision

L3-A is a read-only architecture audit. It changes no production behavior. The immediate decision is:

- do not call the current runtime “LangChain default” merely because the outer graph defaults to LangGraph;
- keep all default switches explicit and reversible;
- migrate active model seams to the shared LangChain boundary before deleting any compatibility code;
- preserve deterministic validation, policy, confirmation, execution, receipt, rollback, persistence, and resource-authorization code;
- stop after this document and the implementation plan. L3-B is not part of this phase.

The repository currently has a LangGraph-default outer shell, a Legacy-default authoritative Orchestrator, an opt-in/admin-only LangChain Query path, and several active direct-HTTP or `completeStructured()` model calls inside planning, specialist agents, clarification, learning, and replanning. The system is therefore hybrid.

## 2. Audit method

The audit traced the production entry from `src/app/api/agent/chat/route.ts` through `handleAgentChatPost`, graph dispatch, orchestration, specialized task execution, query dispatch, dry-run/proposal, confirmation, execution, finalization, and persistence. It also searched `src`, `tests`, `scripts`, and `docs` for:

- provider calls and model APIs (`fetch`, `completeStructured`, `streamText`, `invokeStructured`, `createChatModel`, `ChatOpenAI`, `withStructuredOutput`);
- runtime flags and legacy/langchain/langgraph/router/orchestrator/query/workflow names;
- manual JSON extraction (`JSON.parse`, substring/slice/match, fenced JSON, extractors).

Search matches that only parse trusted application JSON, SSE frames, or deterministic strings are not migration findings. A finding is recorded only when it is on an active or potentially active model path, changes runtime selection, or parses model output.

## 3. Current authoritative path

```text
POST /api/agent/chat
  -> handleAgentChatPost
  -> getAgentGraphRuntimeConfig()             default: langgraph
  -> production-adapter / full LangGraph
  -> orchestration-step
       -> deterministic preflight when applicable
       -> dispatchOrchestrator()               default: legacy
       -> router canary/shadow observation     default: off; never authoritative
  -> orchestration subgraph / native executor
       -> specialized agent enrichment         Legacy completeStructured
       -> dry-run / proposal / confirmation
       -> deterministic executor only after authorization
  -> query dispatcher for exact eligible reads
       -> default: legacy; LangChain + admin adoption both required
  -> turn finalizer / learning loop
  -> persistence
```

`AGENT_GRAPH_RUNTIME` is fail-closed to `langgraph` unless explicitly `legacy`. `AGENT_ORCHESTRATOR_RUNTIME` is fail-closed to `legacy` unless explicitly `langchain`. `AGENT_QUERY_RUNTIME` is fail-closed to `legacy`, and adoption is `off` unless explicitly `admin`. Router Shadow and Canary remain observational and off by default.

## 4. Migration Matrix

| Module | Current production seam | Class | Model boundary / parser | Side effects | L3 destination |
|---|---|---|---|---|---|
| Orchestrator | `orchestration-step` -> `orchestrator-dispatcher` | active production | Legacy `completeStructuredStreaming`; LangChain `invokeStructured` behind flag | produces plans only; downstream may propose/execute | L3-B: make dispatcher the only seam, migrate replan, close prompt/context issues, then switch default |
| Conversational Answer | pre-resolved `answer_question` -> specialized Query enrichment or already-generated answer; `client.ts::generateStreamingReply` is exported/injected but its current resolver parameter is ignored | active answer surface plus dead/unwired compatibility helper | active specialist answer uses Legacy `completeStructured`; old helper uses direct HTTP/SSE and an empty-stream non-stream fallback | response streaming and assistant persistence only | L3-B B6: establish one authoritative answer-generation decision and migrate any reachable text generation without changing SSE/persistence |
| Router | Canary/Shadow hook after Primary; old Router V2 in `client.ts` | shadow + compatibility | Shadow uses `invokeStructured`; V2 uses manual parse in old intent resolver | observational hook has none | retain Shadow/Canary off; retire V2 only after no active callers |
| Query | exact `query_progress` / ID-only `query_plan_progress` guarded dispatcher | active production, opt-in | canonical deterministic facts; LangChain qualitative commentary only | repository reads; no writes | L3-C: parity-gated rollout, then default; keep unsupported variants legacy until migrated |
| Planning | compose dry-run, plan decomposer, topic inference, readiness clarification | active production | direct HTTP + regex/JSON parser; `completeStructured`; deterministic fallback | creates proposals; execution stays gated | L3-D: structured schemas, deterministic facts/validation, no direct model-to-write |
| Checklist | registry/executor and planning linkage | active production | primarily deterministic; may be reached through Orchestrator/specialist enrichment | write candidate and confirmed writes | migrate only model enrichment seam; preserve executor/policy |
| Schedule | readiness, slot extraction, scheduling workflows | active production | `completeStructured` in slot/time/plan scheduling helpers; deterministic fallback | proposals and confirmed writes | L3-D: shared model factory + structured invocation; preserve conflict/readiness gates |
| Memory | save/query/vector memory and learning finalizer | active production | learning/cognitive structured completion; embeddings use direct provider HTTP | learning can save/suggest under policy | L3-D: split chat migration from embedding transport; retain explicit memory authorization |
| Content | timeline/content intents and specialist enrichment | active production | generic specialist `completeStructured` enrichment | proposals and confirmed writes | L3-D: shared structured specialist runtime; preserve content schemas/executor |
| Review | weekly review/evaluate plan | active production | `weekly-review-llm` and specialist enrichment use `completeStructured` | evaluation can persist review records | L3-D: fact-first structured output; retain persistence boundary and confirmation rules |
| LangGraph | `production-adapter` / `full-adapter` | active production default | custom graph nodes around existing services | coordinates all downstream effects | L3-E: consolidate orchestration only after services are migrated; do not absorb policy/executor logic |
| Session Coordinator | standalone pre-router integration | dead/unwired in production; test-only callers | transition engine manually extracts/JSON-parses model text and retains raw attempts | would mutate conversation state, not domain records | decide whether to delete or migrate before wiring; fix flag contract either way |
| Legacy chat client | `client.ts`, function calling/ReAct, answer streaming | compatibility; model resolver is injected but retired resolution ignores it, while answer streaming remains reachable | direct OpenAI-compatible HTTP, SSE parsing, manual JSON extraction | read tools and write proposals in the unwired resolver; execution separately gated | shrink only after caller proof; SSE JSON parsing itself is transport parsing and may remain |
| Tool planner | feature-flagged planner | fallback/experimental compatibility | Legacy `completeStructured` | write proposals gated by flags | keep off; migrate or delete only after caller/flag telemetry proves safe |

### Classification notes

- **Active production:** imported by the default LangGraph adapter or downstream production pipeline and reachable with current defaults or ordinary intent data.
- **Fallback:** deterministic or Legacy behavior invoked after unavailable/invalid model output.
- **Shadow:** executed for observation only and prohibited from changing Primary.
- **Test-only:** injected fakes, evaluation harnesses, and scripts not imported by production.
- **Dead/unwired:** exports with no production caller after import tracing; require a second proof at deletion time.
- **Compatibility:** old facades retained because tests, explicit runtime rollback, or opt-in paths still depend on them.

## 5. Concrete findings

### F1 — Outer LangGraph default does not imply LangChain default

`getAgentGraphRuntimeConfig()` defaults to LangGraph, but the node calls `dispatchOrchestrator()`, whose runtime defaults to Legacy. Query also defaults to Legacy/off. Default-runtime claims must be based on the complete turn, not the outer graph implementation.

### F2 — Replanning bypasses the Orchestrator dispatcher

`orchestration/replan.ts` imports `runOrchestrator` directly. Both incremental and global replan therefore use the Legacy model even when `AGENT_ORCHESTRATOR_RUNTIME=langchain`. This is an active hidden bypass reached from the LangGraph full adapter and orchestration subgraph. L3-B must route all model-backed replanning through the same dispatcher or a shared injected Orchestrator service.

### F3 — Active specialist agents bypass the LangChain boundary

`runSpecializedAgentForTask()` routes every task to an agent definition. Each definition uses `enrichIntentWithAgentPrompt()`, which calls Legacy `completeStructured()` and falls back to the base intent. Thus a LangChain Orchestrator turn can still make a second Legacy model call before dry-run/execute. This is both a migration gap and a duplicate-model-call risk.

### F4 — Planning contains direct HTTP and manual model JSON extraction

`workflows/plan-decomposer.ts` calls `/chat/completions`, regex-extracts fenced/object JSON, calls `JSON.parse`, and falls back to rule-based decomposition. `workflows/plan-seed.ts::inferTopicWithLLM()` also calls the provider directly and accepts unconstrained text. Both are reachable from dry-run/proposal paths. They must move to shared schemas and `invokeStructured()` before Legacy transport deletion.

### F5 — Legacy structured facade hides broad fallback behavior

`llm/complete-structured.ts` performs substring JSON extraction and accepts arbitrary `parse` callbacks. On disabled/unconfigured/HTTP/schema error it can silently invoke a caller-provided fallback. Active callers include specialist enrichment, clarification composer, schedule slot extraction, and workflow helpers. L3 migration must make failure policy explicit per caller; a bulk replacement that changes fallbacks is unsafe.

### F6 — Session Coordinator is unwired, but its latent default contract is contradictory

No production caller of `runCoordinatorPreRouter()` was found; callers are test-only, while `handleAgentChatPost` reads the feature flag only for performance metadata. The subsystem is therefore unwired, not an active model call. Nevertheless, `coordinator-feature-flag.ts` documents default off and “set to 1 to enable,” but implements `process.env.AGENT_SESSION_COORDINATOR !== "0"`, which resolves unset to on. Its transition engine manually extracts JSON and retains first/retry raw model attempts in an internal result. Before it is wired—or before it is deleted—behavior, documentation, redaction, tests, and environment semantics must agree.

### F7 — LangChain Orchestrator has a trust-boundary leak

`buildWorkspaceContext()` correctly places workspace data in a user-role message. However `buildLangChainSystemPrompt(context)` also interpolates current plans and IDs into the system message. This violates its own “untrusted data only in user role” contract. L3-B must make the system prompt context-free and generated from shared schema/intent constants.

### F8 — Prompt/schema drift remains possible

The LangChain Orchestrator prompt handwrites its JSON shape, intent allowlist, roles, and examples while validation lives in Zod. It is strict at validation time but not single-source at prompt-construction time. L3-B must render field/enumeration contracts from schema-adjacent exported constants, without creating a parallel schema.

### F9 — Workspace context is broader than required

The Orchestrator receives up to 8 plans, 8 checklists, 10 memory contents, and 5 content titles. Several intents need only resource identifiers/types or no workspace data. L3-B must introduce intent-independent minimal resource projections and caps, treat all text as untrusted, and prohibit secrets/raw records.

### F10 — Query is fact-first but not yet default-complete

The guarded Query path loads deterministic `QueryFacts`, produces the canonical fact block in code, and lets the model add bounded qualitative commentary. This is the desired architecture. Eligibility is intentionally limited to aggregate progress and numeric-plan-ID progress; adoption is admin-only. Unsupported query variants must remain on their known path until facts parity and live evaluation pass.

### F11 — Learning loop combines model inference with possible writes

`runAgentLearningLoop()` extracts candidates with a model and can save memory or create suggestions according to deterministic policy. The model result is not directly written, but the seam is security-sensitive and invoked by turn finalization. L3-D must preserve the policy decision, deduplication, embedding, and persistence boundaries, and validate the candidate schema through the shared structured service.

### F12 — ReAct/Router V2 client is compatibility code, not proven dead

`client.ts` supports direct function calling, read-tool observations, Router V2 parsing, and answer streaming. The model intent resolver remains injected into both graph adapters, but `resolveLegacyHeuristicStep()` deliberately ignores that parameter, so Router V2/ReAct intent resolution is not an active authoritative call. Other client streaming/model helpers remain reachable for conversational answers. Deletion requires function-level caller and runtime proof, not whole-file or filename-based assumptions.

### F13 — Environment reads are mostly call-time, with one import-time freeze risk

Most runtime resolvers read `process.env` inside functions and tests can inject values. `client.ts` computes `defaultModelBaseUrl` and `defaultModelName` at module import, so later environment changes do not affect those fallback constants. L3-B/D should resolve a complete provider tuple at call time through one configuration service. API keys must never be logged or persisted.

### F14 — Not every `JSON.parse` is a model-output violation

Parsing provider SSE frames in `streamChatCompletion`, HTTP response JSON, persisted JSON fields, and test fixtures is legitimate. Prohibited migration targets are regex/substring extraction of model-authored JSON and schema-less acceptance, notably `complete-structured`, `plan-decomposer`, session transition parsing, and old Router V2 final-content parsing.

### F15 — Raw-output retention exists in an unwired subsystem

`session/transition-engine.ts` places first and retry raw model output in its returned trace. It is not currently called by production, so this is not evidence that raw responses are presently persisted. It is, however, a hard wiring/deletion gate: any future production use must remove or redact raw attempts and keep only safe error categories.

### F16 — General conversational answer generation needs an explicit owner

The current `answer_question` surface has two materially different cases: an intent may already carry a complete `reply`/`args.answer`, in which case `resolveLegacyHeuristicStep()` streams that text deterministically; otherwise specialized Query enrichment can generate the answer through Legacy `completeStructured()`. `client.ts::generateStreamingReply()` still contains direct HTTP/SSE text generation and an empty-stream non-stream second call, but repository import tracing found no active production caller: the function is exported and its dependency is threaded through facades, then deliberately ignored by the retired resolver. L3-B must still classify every caller and establish the authoritative answer boundary. It must reuse an existing Primary answer without another model call, use a LangChain text model only when generation is actually required, and leave dead helper deletion to L3-G after proof.

## 6. Target architecture

```text
HTTP/SSE boundary
  -> LangGraph turn graph (coordination only)
     -> deterministic preflight / pending-action resolution
     -> OrchestratorService
        -> createChatModel(ModelConfig)
        -> buildMessages(trusted protocol, untrusted projected context, user input)
        -> invokeStructured(shared Zod schema)
        -> deterministic DAG + resource-reference validation
     -> specialized services
        -> deterministic facts/readiness first
        -> same model factory + invokeStructured for extraction/classification
        -> typed failure; explicit deterministic fallback where approved
     -> QueryService
        -> repository -> QueryFacts -> canonical response
        -> optional bounded qualitative LangChain commentary
     -> ConversationalAnswerService
        -> reuse already-generated authoritative answer, or
        -> createChatModel -> validated text-only stream (one call)
        -> existing SSE + persistence terminal boundary
     -> policy / dry-run / confirmation / executor
     -> receipt / rollback / persistence / finalization
```

The target has one chat-model factory, one structured invocation service, one message trust-boundary builder, shared Zod contracts, and explicit typed failure results. LangGraph owns ordering and resumability; it does not own authorization or domain writes. Models may classify, extract, plan candidates, or phrase facts. They never directly authorize or persist a mutation.

## 7. Protected boundaries

The following invariants are non-negotiable across L3:

1. Primary decisions remain authoritative until the corresponding phase explicitly switches a guarded runtime.
2. Shadow/Canary output cannot enter draft, policy, confirmation, execution, persistence, receipt, or rollback.
3. Every write remains a typed candidate followed by deterministic validation, policy, and confirmation/auto-approval rules.
4. Resource IDs must come from validated context, repository results, or typed upstream task output; the model cannot invent them.
5. Raw prompt, raw response, hidden reasoning, API keys, and secrets are never persisted or logged.
6. Workspace content is untrusted data in a user/context message and is projected to the minimum fields required.
7. Schema failure is a typed failure. No JSON substring recovery, partial intent guessing, or automatic Legacy model fallback after a default switch.
8. Query facts are computed deterministically; a model may not recompute or alter them.
9. Model tool calls are never executed merely because the provider emitted them. Tool exposure and execution remain allowlisted and separately authorized.
10. A complete turn owns model-call accounting so duplicate Orchestrator/specialist/query calls are visible.
11. Answer generation is selected once: an already-generated authoritative answer is reused, while a missing answer may trigger at most one text-generation call.
12. Reasoning and tool-call blocks from a conversational stream are never emitted, persisted, or executed.

## 8. Migration and default-switch order

1. **L3-B authoritative surface closure:** first close Orchestrator dispatch/replan and duplicate-call accounting without migrating domain specialists; then close the conversational answer-generation boundary. Switch the Orchestrator default only after both sub-surfaces and Provider gates pass. L3-B completion means the authoritative Orchestrator and general answer surface are LangChain-owned; downstream domain specialist seams may still be Legacy and must be reported as such.
2. **L3-C Query closure:** expand only intents with deterministic fact parity; preserve canonical-first persistence and normal terminal semantics; classify every active Query as `LANGCHAIN_ENHANCED`, `DETERMINISTIC`, `NOT_PURE_READ`, or `RETIRED`; then switch Query runtime/adoption in a separate change. L3-C exit requires `activeLegacyQueryModelCalls = 0`.
3. **L3-D specialized workflows:** migrate Planning, Checklist, Schedule, Memory, Content, and Review model seams one bounded domain at a time. Remove direct provider chat calls and model JSON extractors only after tests and live smoke.
4. **L3-E LangGraph consolidation:** remove duplicate legacy orchestration graphs/facades only after all active nodes call migrated services. Preserve checkpoint compatibility or provide an explicit versioned drain strategy.
5. **L3-F global default and soak:** change defaults separately from implementation. Before claiming the whole runtime is LangChain-default, require `activeProductionDirectChatHttpCalls = 0`, `activeProductionCompleteStructuredCalls = 0`, and `activeLegacyChatModelCalls = 0`; deterministic and embedding-only paths are classified separately. Observe schema rate, fallback, duplicate calls, latency, cost, unsafe adoption, execution, and persistence for a defined window. Roll back through environment/runtime config.
6. **L3-G decommission:** delete Legacy code only after search/caller/telemetry proof and after the rollback window closes.

No phase may combine implementation migration, default switch, and deletion in one commit.

## 9. Rollback strategy

- L3-B: set `AGENT_ORCHESTRATOR_RUNTIME=legacy` before the default changes; after default changes, retain an explicit `legacy` override through the soak window.
- L3-C: set `AGENT_QUERY_RUNTIME=legacy` and `AGENT_QUERY_ADOPTION=off`.
- L3-E/F: set `AGENT_GRAPH_RUNTIME=legacy` only while the compatibility graph remains supported and tested.
- Router Shadow/Canary: keep `AGENT_ROUTER_SHADOW=off` and Canary disabled unless running an explicit evaluation.
- Code rollback: revert the individual phase commit. Do not rely on a mixed migration/deletion commit.

Fallback means selecting a runtime before a turn. Once a LangChain call starts, its schema/provider failure returns a typed safe failure; it does not silently invoke the Legacy model within the same turn.

After the L3-C adoption commit, unset values resolve to `AGENT_QUERY_RUNTIME=langchain` and `AGENT_QUERY_ADOPTION=admin`. The explicit rollback values remain `AGENT_QUERY_RUNTIME=legacy` and `AGENT_QUERY_ADOPTION=off`. Removing the adoption gate is deferred to L3-F or L3-G.

## 10. Legacy deletion prerequisites

Legacy Orchestrator, Router V2, `completeStructured`, direct chat HTTP helpers, compatibility graph, and manual model JSON parsers may be deleted only when all applicable conditions hold:

- `rg` finds no production import/call outside an explicitly retained adapter;
- runtime telemetry shows no selection during the agreed soak window;
- deterministic and live parity gates pass for every migrated intent;
- rollback no longer depends on the implementation;
- checkpoint/resume compatibility is resolved;
- no model-output parser, prompt, or schema is referenced by scripts or operational evaluation;
- runtime inventory reports zero active production direct-chat HTTP calls, `completeStructured()` calls, and Legacy chat-model calls;
- full test, lint, typecheck, smoke, task-execution, database-mutation, and duplicate-call gates pass;
- a dedicated deletion commit and rollback plan exist.

Embedding HTTP is not deleted merely because chat completion is migrated; it is a separate provider capability and requires its own boundary/telemetry decision.

## 11. Test and evaluation matrix

| Boundary | Deterministic tests | Live/operational evidence | Gate |
|---|---|---|---|
| Orchestrator protocol | schema/allowlist same-source, DAG, clarify linkage, untrusted injection, resource references | fixed fixture set, schema pass, semantic mismatch, latency/cost | 100% strict schema; zero unsafe write/resource/injection cases |
| Runtime dispatch | explicit legacy/langchain, unknown/unset behavior, no within-turn fallback | runtime selection counters | exactly one authoritative implementation per turn |
| Replan | dispatcher injection, completed-task preservation, no duplicate write | failure scenarios | zero direct Legacy bypass |
| Conversational answer | generated-answer reuse, one decision/call, reasoning/tool block rejection, SSE/persistence invariance | consultation and already-answered fixtures | no duplicate answer call; no direct chat HTTP on an active path |
| Specialist agents | schema-complete deterministic bypass and whole-turn accounting in L3-B; structured migration in L3-D | domain smoke | L3-B records remaining Legacy seams; L3-D removes direct HTTP/manual model JSON parser |
| Query | facts parity, canonical block invariance, accepted/omitted commentary, canonical-only persistence and normal done | Legacy vs QueryFacts fixtures | zero fact mismatch/write adoption/partial output; one facts load; `activeLegacyQueryModelCalls=0` at L3-C exit |
| Safety/execution | policy, confirmation, resource guard, executor isolation | task execution/database mutation counters during evaluation | zero unauthorized execution/mutation |
| LangGraph | node ordering, resume/checkpoint, one-call accounting | soak traces | no duplicate model/domain action |
| Data protection | collector redaction, context projection, prompt injection | audit sample without raw payloads | no raw prompt/response/reasoning/secret |
| Rollback | environment resolver tests and legacy compatibility suite | rollback drill | restored known path without migration/schema change |

## 12. Provider adoption gates and denominators

Safety, availability, and product performance are separate verdicts. A safe typed clarify is a safety success but an Orchestrator product-completion failure. No metric uses schema-valid samples as the denominator for transport availability.

### Safety gates — any failure immediately fails the evaluation round

- `completedProviderResponsesSchemaValid = schema-valid completed Provider payloads / completed Provider payloads = 100%`;
- `safeTypedFailureRate = typed safe failures / all transport, timeout, schema, and validation failures = 100%`;
- `readToWriteMismatch = 0`;
- `clarifyToWriteMismatch = 0`;
- `inventedResource = 0`;
- `invalidDAG = 0`;
- `promptInjectionSuccess = 0`;
- `writeWithoutDraft = 0`;
- `duplicateModelCall = 0`, measured across the complete turn and excluding explicitly separate optional Query commentary only where its contract permits one call;
- `businessMutationDuringEvaluation = 0`;
- raw prompt/response/reasoning/secret retention = 0.

### Availability gates — failure blocks the default switch but preserves the safe implementation

Use the unchanged fixed fixture matrix for three consecutive rounds (at least 99 authoritative Orchestrator observations). Report counts as well as rates:

- `providerTransportSuccessRate = Provider requests that return a completed payload / all Provider requests >= 99%`;
- `providerTimeoutRate = timed-out Provider requests / all Provider requests <= 1%`;
- `orchestratorCompletionRate = schema-valid usable Orchestrator plans / all authoritative Orchestrator observations >= 99%`;
- every original fixed fixture must obtain at least one non-timeout schema-valid result across the three rounds;
- the single-round fixed-matrix acceptance run still requires every fixture to finish with a schema-valid usable plan before the default commit.

These gates are stricter than the earlier Router Canary evidence, where 4/32 observations timed out at the 8-second boundary, and are consistent with the later Query limited-adoption evidence of 30/30 Provider completions. A transport/schema failure can remain safely isolated while still blocking adoption.

### Performance gates — failure blocks adoption, not implementation

- conversational answer TTFT P50 `<= 4,000 ms` and observed upper tail `<= 8,000 ms`;
- authoritative Orchestrator total latency P50 `<= 8,000 ms` and observed upper tail `<= 20,000 ms`;
- end-to-end authoritative answer total latency P50 `<= 8,000 ms` and observed upper tail `<= 20,000 ms`;
- report Provider calls, usage, and cost, using `N/A` only when metadata is unavailable.

Structured Orchestrator invocation has no user-visible token stream, so TTFT applies to the separate conversational answer stream; Orchestrator reports total invocation latency. The limits reflect the observed Query Provider P50 of about 3.2 seconds and upper tail of about 7.9 seconds while rejecting the earlier Router upper tails near 20–31 seconds as a default-product target. Timeouts and retry budgets are fixed before evaluation and must not be raised to make a report pass.

## 13. L3-A exit assessment

The audit and target design are complete when paired with the implementation plan, but no runtime migration is claimed. Current state remains:

- LangGraph outer runtime: default on;
- LangChain Orchestrator: available but not default;
- LangChain Query: guarded and not default;
- Router Shadow/Canary: off unless explicitly enabled;
- Legacy chat/model seams: still active;
- L3-B: not started.
