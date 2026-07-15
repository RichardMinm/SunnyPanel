# L3-B-R2 Provider Protocol Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the opaque DeepSeek `prompt_json` parser boundary with explicit, strict, safely observable parsing and complete the staged Provider revalidation without runtime adoption.

**Architecture:** Keep LangChain `ChatOpenAI` as transport. A request-scoped fetch observer derives bounded envelope metadata, while `invokeStructured()` explicitly extracts and parses prompt-JSON and validates the original parsed object with both the diagnostic base schema and authoritative strict schema. Native JSON Schema and function-calling paths remain unchanged.

**Tech Stack:** TypeScript, Node test runner, Zod 4, LangChain `@langchain/openai`, OpenAI-compatible Chat Completions, DeepSeek V4-Pro.

## Global Constraints

- Default Orchestrator runtime remains Legacy.
- Do not modify Executor, Policy Guard, confirmation, receipt, rollback, Payload schema, migrations, checkpoint, Planning, or Schedule write paths.
- Do not add dependencies or JSON repair.
- Do not retain raw prompt, response, content, reasoning, tool arguments, workspace text, identifiers, credentials, headers, cookies, or secrets.
- Real Provider evaluation stays manual, DB-free, `/tmp`-only, Keychain-backed, and outside default CI.
- Targeted runs stop after the first failed gate unless one evidence-supported single-variable repair is made; maximum targeted budget is 45 Provider requests.
- Acceptance 33, six diagnostics, and stability 99 remain strictly sequential.

---

### Task 1: Commit the approved design and implementation plan

**Files:**
- Create: `docs/design/phase-l3b-r2-provider-protocol-closure.md`
- Create: `docs/superpowers/plans/2026-07-15-l3b-r2-provider-protocol-closure.md`

**Interfaces:**
- Consumes: the approved L3-B-R2 brief and R2-A forensic evidence.
- Produces: the frozen architecture, scope, test matrix, and Live Gate order.

- [ ] **Step 1: Check the documents for placeholders and contradictions**

Run:

```bash
rg -n 'T[B]D|T[O]DO|implement later|fill in' \
  docs/design/phase-l3b-r2-provider-protocol-closure.md \
  docs/superpowers/plans/2026-07-15-l3b-r2-provider-protocol-closure.md
```

Expected: no output.

- [ ] **Step 2: Verify documentation diff**

```bash
git diff --check
git diff --stat
```

Expected: only the two R2 documentation files.

- [ ] **Step 3: Commit the design**

```bash
git add \
  docs/design/phase-l3b-r2-provider-protocol-closure.md \
  docs/superpowers/plans/2026-07-15-l3b-r2-provider-protocol-closure.md
git diff --cached --check
git commit -m "docs(agent): design provider protocol closure"
```

---

### Task 2: Add real Provider-envelope RED coverage

**Files:**
- Create: `tests/agent/llm/invoke-structured-envelope.test.ts`
- Modify: `tests/agent/llm/invoke-structured.test.ts`
- Modify: `tests/agent/llm/model-factory.test.ts`

**Interfaces:**
- Consumes: `createModelConfig()`, the real `createChatModel()`, and `invokeStructured()`.
- Produces: synthetic `fetch` fixtures that traverse the installed OpenAI SDK and LangChain adapter.

- [ ] **Step 1: Add a synthetic envelope helper**

The helper returns standards-shaped `Response` objects and never stores request
messages or response content outside a single test call:

```ts
const completionEnvelope = (params: {
  content?: unknown;
  finishReason?: string;
  reasoningContent?: unknown;
  toolCalls?: unknown;
}) => ({
  id: "chatcmpl-synthetic",
  object: "chat.completion",
  created: 1,
  model: "deepseek-v4-pro",
  choices: [{
    index: 0,
    finish_reason: params.finishReason ?? "stop",
    message: {
      role: "assistant",
      ...(params.content === undefined ? {} : { content: params.content }),
      ...(params.reasoningContent === undefined
        ? {}
        : { reasoning_content: params.reasoningContent }),
      ...(params.toolCalls === undefined ? {} : { tool_calls: params.toolCalls }),
    },
  }],
  usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
});
```

- [ ] **Step 2: Add the required success fixtures**

Cover plain JSON, a whole fenced JSON block, reasoning plus valid content,
`finish_reason=stop`, Unicode text, and every required schema field. Assert the
final result and every safe observer phase.

- [ ] **Step 3: Add the required failure fixtures**

Cover empty/missing content, empty choices, reasoning-only, tool-only,
malformed/truncated JSON, length finish, required/type/enum/extra failures,
invalid envelope, HTTP 400/401/403/429/500, timeout, and unsupported normalized
content. Every fixture asserts:

```ts
assert.equal(result.ok, false);
assert.equal(result.error.code, expectedUpperCode);
assert.equal(result.error.structuredOutput?.protocolFailure, expectedSubtype);
assert.equal(lastDiagnostics.parserSubstage, expectedSubstage);
assert.equal(lastDiagnostics.strictSchemaReached, expectedStrictReached);
assert.equal(forbiddenReportKey(lastDiagnostics), null);
```

- [ ] **Step 4: Add request-shape tests without retaining messages**

The fake fetch derives only a safe request summary and asserts:

```ts
assert.equal(summary.stream, false);
assert.equal(summary.responseFormat, "json_object");
assert.equal(summary.maxTokens, 4096);
assert.equal(summary.thinking, "disabled");
assert.equal(summary.toolsPresent, false);
```

- [ ] **Step 5: Run RED**

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG \
  PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 \
  AGENT_DISABLE_LLM=1 TSX_TSCONFIG_PATH=tsconfig.agent-test.json \
  node --import tsx --test \
  tests/agent/llm/invoke-structured-envelope.test.ts \
  tests/agent/llm/invoke-structured.test.ts \
  tests/agent/llm/model-factory.test.ts
```

Expected: FAIL because safe protocol types, request hooks, explicit parser, and
strict raw-object validation do not exist.

- [ ] **Step 6: Commit the RED contract**

```bash
git add \
  tests/agent/llm/invoke-structured-envelope.test.ts \
  tests/agent/llm/invoke-structured.test.ts \
  tests/agent/llm/model-factory.test.ts
git diff --cached --check
git commit -m "test(agent): add real provider-envelope protocol coverage"
```

---

### Task 3: Expose safe protocol diagnostics and observer stages

**Files:**
- Create: `src/lib/agent/llm/structured-protocol.ts`
- Modify: `src/lib/agent/llm/model-errors.ts`
- Modify: `src/lib/agent/llm/model-config.ts`
- Modify: `src/lib/agent/llm/model-factory.ts`
- Modify: `src/lib/agent/llm/invoke-structured.ts`
- Modify: `src/lib/agent/orchestration/langchain-orchestrator.ts`
- Modify: `src/lib/agent/orchestration/l3b-evaluation.ts`
- Modify: `scripts/agent-orchestrator-canary-eval.mjs`
- Modify: `tests/agent/orchestration/l3b-evaluation.test.ts`
- Modify: `tests/agent/orchestration/orchestrator-live-gate-contract.test.ts`

**Interfaces:**
- Produces: `StructuredProtocolFailure`, `SafeProtocolDiagnostics`,
  `SafeProviderResponseObservation`, `createSafeProtocolFetch()`.
- Replaces: `started/succeeded/failed` observer semantics with the approved
  stage events while retaining `provider_protocol` as the upper failure reason.

- [ ] **Step 1: Define closed safe types and immutable defaults**

Use the exact enums from the design and expose:

```ts
export const createSafeProtocolDiagnostics = (): SafeProtocolDiagnostics => ({
  responseReceived: false,
  httpStatusClass: "not_available",
  choicesState: "not_available",
  contentState: "not_available",
  reasoningPresent: false,
  toolCallsPresent: false,
  finishReason: null,
  parserSubstage: "not_started",
  baseSchemaReached: false,
  strictSchemaReached: false,
  semanticValidationReached: false,
  latencyMs: null,
});
```

- [ ] **Step 2: Add the safe response observer to the model factory**

Extend `ModelFactory` with an optional second parameter. The default factory
passes `configuration.fetch` only when a safe observer exists. The wrapper must
return the original response unchanged and must never include body values in an
event or error.

- [ ] **Step 3: Replace observer semantics**

Emit `providerRequestStarted` before each real call. Emit
`providerResponseReceived` only from the safe fetch boundary or, for injected
non-HTTP model tests, from a successfully resolved model invocation with
`not_available` envelope detail. Emit parser/schema stages at their actual
boundaries and include the final safe snapshot in `failed`.

- [ ] **Step 4: Emit semantic validation separately**

Wrap the observer in `runLangChainOrchestratorResult()` to remember only the
latest numeric attempt. After decision-consistency validation, emit
`semanticValidationCompleted` with a boolean pass and a safe diagnostic snapshot.

- [ ] **Step 5: Update evaluation counters and sanitizer**

Add run/report counters for response receipt, JSON parse, base schema, strict
schema, and semantic completion. Permit only the exact safe diagnostic keys and
their exact value types in `assertSanitizedL3BReport()`. Keep all similar raw
keys forbidden.

- [ ] **Step 6: Run focused diagnostics tests**

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG \
  PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 \
  AGENT_DISABLE_LLM=1 TSX_TSCONFIG_PATH=tsconfig.agent-test.json \
  node --import tsx --test \
  tests/agent/orchestration/l3b-evaluation.test.ts \
  tests/agent/orchestration/orchestrator-live-gate-contract.test.ts \
  tests/agent/orchestration/langchain-orchestrator.test.ts \
  tests/agent/llm/invoke-structured.test.ts
```

Expected: diagnostics/harness tests pass; envelope parser tests still fail at
the explicit parsing contract.

- [ ] **Step 7: Commit safe diagnostics**

```bash
git add \
  src/lib/agent/llm/structured-protocol.ts \
  src/lib/agent/llm/model-errors.ts \
  src/lib/agent/llm/model-config.ts \
  src/lib/agent/llm/model-factory.ts \
  src/lib/agent/llm/invoke-structured.ts \
  src/lib/agent/orchestration/langchain-orchestrator.ts \
  src/lib/agent/orchestration/l3b-evaluation.ts \
  scripts/agent-orchestrator-canary-eval.mjs \
  tests/agent/orchestration/l3b-evaluation.test.ts \
  tests/agent/orchestration/orchestrator-live-gate-contract.test.ts
git diff --cached --check
git commit -m "fix(agent): expose safe structured-output protocol stages"
```

---

### Task 4: Make prompt-JSON parsing explicit and strict

**Files:**
- Create: `src/lib/agent/llm/prompt-json-parser.ts`
- Modify: `src/lib/agent/llm/invoke-structured.ts`
- Modify: `src/lib/agent/llm/model-factory.ts`
- Modify: `src/lib/agent/orchestration/l3b-evaluation-config.ts`
- Modify: `scripts/agent-orchestrator-canary-eval.mjs`
- Modify: `tests/agent/llm/invoke-structured-envelope.test.ts`
- Modify: `tests/agent/llm/invoke-structured.test.ts`
- Modify: `tests/agent/llm/model-config.test.ts`
- Modify: `tests/agent/llm/model-factory.test.ts`
- Modify: `tests/TEST_MAP.md`

**Interfaces:**
- Produces: `extractWholePromptJson()` and `parsePromptJsonObject()`.
- Preserves: `invokeStructured()` public success/failure contract and existing
  native JSON Schema/function-calling strategies.

- [ ] **Step 1: Implement whole-output extraction**

```ts
export const extractWholePromptJson = (text: string) => {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return { ok: true as const, candidate: trimmed };
  }
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (!fenced || !fenced[1]?.trim().startsWith("{")
      || !fenced[1].trim().endsWith("}")) {
    return { ok: false as const };
  }
  return { ok: true as const, candidate: fenced[1].trim() };
};
```

Do not add recovery, balancing, substring scanning for an inner object, or
multiple-object selection.

- [ ] **Step 2: Validate the same raw object twice**

Parse the extracted candidate once. Run `modelSchema.safeParse(rawObject)` only
to classify base-schema failures. Discard its transformed data. Run
`schema.safeParse(rawObject)` and return only the final strict data.

- [ ] **Step 3: Add explicit prompt-json invocation**

For `prompt_json`, call:

```ts
const jsonModel = model.withConfig({
  outputVersion: "v0",
  response_format: { type: "json_object" },
});
const message = await jsonModel.invoke(lcMessages, { signal, tags });
```

Extract only a string final content. Never read reasoning or tool arguments as
the result. Keep `withStructuredOutput()` only for native schema and function
calling.

- [ ] **Step 4: Freeze evaluation protocol configuration**

Extend `ModelConfig` with optional `thinkingMode`. The evaluation config sets:

```ts
orchestratorMaxOutputTokens: 4096,
orchestratorThinkingMode: "disabled",
```

The factory sends `thinking: { type: "disabled" }` through `modelKwargs` only
when configured. The canary model config passes both values. Update the frozen
evaluation config version/hash tests.

- [ ] **Step 5: Run the complete focused protocol matrix**

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG \
  PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 \
  AGENT_DISABLE_LLM=1 TSX_TSCONFIG_PATH=tsconfig.agent-test.json \
  node --import tsx --test \
  tests/agent/llm/invoke-structured-envelope.test.ts \
  tests/agent/llm/invoke-structured.test.ts \
  tests/agent/llm/model-config.test.ts \
  tests/agent/llm/model-factory.test.ts \
  tests/agent/orchestration/langchain-orchestrator.test.ts \
  tests/agent/orchestration/l3b-evaluation.test.ts \
  tests/agent/orchestration/orchestrator-live-gate-contract.test.ts
```

Expected: all pass with zero network calls.

- [ ] **Step 6: Commit the explicit parser**

```bash
git add \
  src/lib/agent/llm/prompt-json-parser.ts \
  src/lib/agent/llm/invoke-structured.ts \
  src/lib/agent/llm/model-factory.ts \
  src/lib/agent/orchestration/l3b-evaluation-config.ts \
  scripts/agent-orchestrator-canary-eval.mjs \
  tests/agent/llm/invoke-structured-envelope.test.ts \
  tests/agent/llm/invoke-structured.test.ts \
  tests/agent/llm/model-config.test.ts \
  tests/agent/llm/model-factory.test.ts \
  tests/TEST_MAP.md
git diff --cached --check
git commit -m "fix(agent): make prompt-json parsing explicit and strict"
```

---

### Task 5: Verify deterministic closure and freeze the first Live run

**Files:**
- No new source files.
- Local-only report: `/tmp/l3b-r2-targeted.json`

**Interfaces:**
- Consumes: the exact committed parser/diagnostics/config state.
- Produces: a frozen run manifest and the first sanitized targeted result.

- [ ] **Step 1: Run the full deterministic baseline**

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run typecheck
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:agent
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:agent:planning
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:agent:schedule
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run test:content
npm run lint
npx eslint . --ignore-pattern '.claude/worktrees/**'
node --check scripts/agent-orchestrator-canary-eval.mjs
git diff --check
```

Expected: every command exits zero; lint may retain only the documented existing
warnings.

- [ ] **Step 2: Verify runtime and protected-module boundaries**

```bash
git status --short --branch
git diff aad4c03e54e34c1d5e23f72e2398b85dd41edd03...HEAD --stat
rg -n 'AGENT_ORCHESTRATOR_RUNTIME' src/lib/agent/orchestration/runtime-config.ts
```

Expected: clean branch, Legacy remains default, and no protected execution or
database module appears in the diff.

- [ ] **Step 3: Record the frozen safe run manifest**

Record branch, HEAD, prompt hash, schema hash, evaluation config hash, selected
fixture IDs, rounds, model, `prompt_json`, output budget 4096, thinking disabled,
30-second timeout, transport retry 1, and schema retry 0. Do not record prompt,
context, fixture text, or credentials.

- [ ] **Step 4: Confirm the Keychain item without printing it**

```bash
security find-generic-password \
  -a "$USER" -s sunnypanel-deepseek-eval >/dev/null
```

Expected: exit 0. Otherwise stop all Provider work.

- [ ] **Step 5: Run exactly targeted 15**

Use the approved Keychain/process-local command from the phase brief, unset
`DATABASE_URL`, redirect Provider stdout/stderr, write only
`/tmp/l3b-r2-targeted.json`, unset `DEEPSEEK_API_KEY`, and validate the report.

Continue only if the existing targeted gate is true. A failure unlocks only the
decision table in the phase brief and at most one single-variable repair.

---

### Task 6: Execute conditional acceptance and stability gates

**Files:**
- No source changes during a run.
- Local-only reports under `/tmp/l3b-r2-*.json`.

**Interfaces:**
- Consumes: a passing targeted run and immutable committed configuration.
- Produces: acceptance 33, isolated six diagnostics, and optionally stability 99.

- [ ] **Step 1: If targeted failed, stop or perform one evidence-based repair**

Use only `responseReceived`, HTTP class, content state, finish reason, parser
substage, schema reachability, and sanitized mismatch categories. Do not modify
Prompt for transport/envelope/reasoning-only failures. Commit one main variable,
rerun focused/full deterministic tests, freeze a new HEAD, and run the next
targeted 15. Stop after three targeted runs.

- [ ] **Step 2: Run acceptance 33 only after targeted pass**

Require exactly 33 authoritative observations and the unchanged schema,
semantic, latency, safety, timeout, completion, and coverage gates.

- [ ] **Step 3: Evaluate six known-ID diagnostics separately**

Require six of six passing while keeping them outside every authoritative
denominator. Any failure stops the phase.

- [ ] **Step 4: Run fresh stability 99 only after acceptance and diagnostics pass**

Read the accepted evaluation config hash from the sanitized acceptance report.
Require exactly 99 fresh observations, three rounds, full coverage, and every
existing safety/performance/schema/semantic gate.

- [ ] **Step 5: Produce the completion report and stop**

Report the required 19 sections, actual commits and revert commands, Provider
budgets and sanitized metrics, deterministic verification, protected modules,
and `Legacy remains default: yes`. Even on full pass, output only that an
independent Runtime Adoption Review may be proposed.
