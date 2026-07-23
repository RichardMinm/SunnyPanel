# L3-B Acceptance Completion Resource Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining Acceptance 33 `exr-3` semantic branch by making the shared Full Orchestrator contrast explicitly reject both progress-read and untrusted-completion-write decisions.

**Architecture:** Keep the current Provider-to-Mapper pipeline unchanged. Extend only the schema-typed `imperative_completion_mutation` metadata rendered into the Full Orchestrator Prompt, and prove the exact admitted and forbidden shapes with a deterministic contract test before making the production change.

**Tech Stack:** TypeScript, Node.js test runner, LangChain message construction, existing Zod-derived Orchestrator and Router types.

## Global Constraints

- Do not change the 33 fixtures, Gate metrics, thresholds, Provider settings, retries, timeout, or runtime defaults.
- Do not change Resource Readiness Guard, Query Scope, compatibility Mapper, Orchestrator Zod schemas, or `invokeStructured()`.
- Do not add post-validation repair, automatic Legacy fallback, execution, database access, or business mutation.
- Do not add a dependency or retain raw Provider prompts, responses, reasoning, or credentials.
- Do not call DeepSeek during implementation or deterministic verification.
- Keep `exr-3` expected as single `clarify`.
- A subsequent Acceptance 33 run requires separate Provider data disclosure and approval.

---

### Task 1: Close the imperative completion semantic contrast

**Files:**
- Modify: `tests/agent/orchestration/orchestrator-semantic-contrast-protocol.test.ts`
- Modify: `src/lib/agent/orchestration/orchestrator-intent-family-protocol.ts`

**Interfaces:**
- Consumes: `ORCHESTRATOR_SEMANTIC_CONTRASTS`, `ORCHESTRATOR_SEMANTIC_CONTRAST_PROTOCOL`, and `buildLangChainSystemPrompt()`.
- Produces: the existing `imperative_completion_mutation` contrast with admitted tuple `explicit_write_missing_resource / single / clarify`, forbidden decisions `pure_read_query` and `explicit_write_ready`, and forbidden intents `query_plan_progress` and `complete_plan_item`.

- [ ] **Step 1: Add the focused failing contract test**

Append this test to
`tests/agent/orchestration/orchestrator-semantic-contrast-protocol.test.ts`:

```ts
test("closes imperative completion against read and untrusted write branches", () => {
  const contrast = ORCHESTRATOR_SEMANTIC_CONTRASTS.find(
    ({ id }) => id === "imperative_completion_mutation",
  );

  assert.ok(contrast);
  assert.deepEqual(contrast.admitted, {
    decisionCode: "explicit_write_missing_resource",
    intents: ["clarify"],
    mode: "single",
  });
  assert.deepEqual(
    contrast.forbiddenDecisionCodes,
    ["pure_read_query", "explicit_write_ready"],
  );
  assert.deepEqual(
    contrast.forbiddenIntents,
    ["query_plan_progress", "complete_plan_item"],
  );
  assert.match(contrast.reason, /计划标题不能替代清单标题/);
  assert.match(contrast.reason, /精确且唯一/);

  const prompt = buildLangChainSystemPrompt();
  assert.match(prompt, /禁止 decisionCode=pure_read_query,explicit_write_ready/);
  assert.match(prompt, /禁止 intents=query_plan_progress,complete_plan_item/);
  assert.match(prompt, /计划标题不能替代清单标题/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG \
  PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 \
  AGENT_DISABLE_LLM=1 \
  node --import tsx --test \
  tests/agent/orchestration/orchestrator-semantic-contrast-protocol.test.ts
```

Expected: FAIL in
`closes imperative completion against read and untrusted write branches`
because the current forbidden decisions are only `["pure_read_query"]` and the
current forbidden intents are only `["query_plan_progress"]`.

- [ ] **Step 3: Make the minimal shared protocol change**

Replace only the `imperative_completion_mutation` entry in
`src/lib/agent/orchestration/orchestrator-intent-family-protocol.ts` with:

```ts
  semanticContrast({
    admitted: {
      decisionCode: "explicit_write_missing_resource",
      intents: ["clarify"],
      mode: "single",
    },
    forbiddenDecisionCodes: [
      "pure_read_query",
      "explicit_write_ready",
    ],
    forbiddenIntents: [
      "query_plan_progress",
      "complete_plan_item",
    ],
    id: "imperative_completion_mutation",
    reason:
      "祈使完成或标记完成是 mutation；complete_plan_item 只能操作已有清单项。计划标题不能替代清单标题，workspace 中存在计划也不证明清单存在；没有 actor-authorized context 中精确且唯一的 checklistTitle 时，必须选择 explicit_write_missing_resource 并澄清。",
    requestPattern:
      "中性示例：workspace 只有一份课程计划，没有匹配清单；用户命令完成该计划中的一个条目。",
  }),
```

Do not change any other semantic contrast.

- [ ] **Step 4: Run the focused contract test and verify GREEN**

Run the Step 2 command again.

Expected: all tests in
`orchestrator-semantic-contrast-protocol.test.ts` PASS with no Provider or
database call.

- [ ] **Step 5: Run focused boundary regression tests**

Run:

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG \
  PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 \
  AGENT_DISABLE_LLM=1 \
  node --import tsx --test \
  tests/agent/orchestration/orchestrator-semantic-contrast-protocol.test.ts \
  tests/agent/orchestration/orchestrator-live-semantic-boundary.test.ts \
  tests/agent/orchestration/langchain-orchestrator.test.ts \
  tests/agent/orchestration/residual-planning-input-contract.test.ts
```

Expected: all focused tests PASS. In particular:

- the Full Prompt renders the completed contrast;
- the Residual Prompt remains excluded from the Full-only contrast marker;
- the existing `exr-3` accepted clarify shape remains successful;
- an untrusted write candidate still fails closed in Resource Readiness Guard;
- no Mapper or execution path repairs the invalid decision.

- [ ] **Step 6: Run type and whitespace verification**

Run:

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run typecheck
git diff --check
git status --short --branch
```

Expected: typecheck PASS, `git diff --check` produces no output, and only the
two scoped implementation files are modified.

- [ ] **Step 7: Inspect the final diff for protected-path drift**

Run:

```bash
git diff --name-only
git diff -- src/lib/agent/orchestration/orchestrator-intent-family-protocol.ts
git diff -- tests/agent/orchestration/orchestrator-semantic-contrast-protocol.test.ts
```

Expected: no fixture, Gate, Resource Guard, Mapper, schema, runtime-default, or
Provider configuration file appears in the diff.

- [ ] **Step 8: Commit the implementation**

Run:

```bash
git add \
  src/lib/agent/orchestration/orchestrator-intent-family-protocol.ts \
  tests/agent/orchestration/orchestrator-semantic-contrast-protocol.test.ts
git diff --cached --check
git commit -m "fix(agent): close completion resource contrast"
git rev-parse HEAD
git status --short --branch
```

Expected: one implementation commit is created and the worktree is clean.

- [ ] **Step 9: Prepare but do not execute Acceptance 33**

Preserve the previous failed report under its evaluated HEAD:

```bash
if test -e /tmp/l3b-r8-production-acceptance.json; then
  mv \
    /tmp/l3b-r8-production-acceptance.json \
    /tmp/l3b-r8-production-acceptance-6f62283-failed.json
fi
```

Resolve the exact clean HEAD and evaluation configuration hash locally:

```bash
HEAD="$(git rev-parse HEAD)"
CONFIG_HASH="$(
  PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 \
  node --import tsx -e '
    const { L3B_EVALUATION_CONFIG_HASH } =
      await import("./src/lib/agent/orchestration/l3b-evaluation-config.ts");
    process.stdout.write(L3B_EVALUATION_CONFIG_HASH);
  '
)"
```

Run only the evaluator's no-network preflight:

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG -u AGENT_DISABLE_LLM \
  AGENT_PRODUCTION_SEAM_EVAL=1 \
  AGENT_LIVE_LLM_EVAL=1 \
  L3B_PRODUCTION_PROVIDER_DATA_APPROVED=1 \
  L3B_PRODUCTION_GATE_PREFLIGHT_ONLY=1 \
  L3B_PRODUCTION_GATE_STAGE=acceptance \
  L3B_PRODUCTION_GATE_ACCEPTED_HEAD="$HEAD" \
  L3B_PRODUCTION_GATE_ACCEPTED_CONFIG_HASH="$CONFIG_HASH" \
  PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 \
  node --import tsx scripts/agent-production-seam-gate-eval.mjs
```

Expected: preflight status is ready with `providerAttempts=0`. Stop and request
separate informed approval before any DeepSeek request. Record the exact HEAD,
configuration hash, 33 fixture IDs, disclosure scope, maximum logical calls,
and maximum Provider attempts.
