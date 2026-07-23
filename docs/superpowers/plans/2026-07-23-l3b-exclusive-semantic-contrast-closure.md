# L3-B Exclusive Semantic Contrast Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Full Orchestrator semantic contrast an exclusive admitted-tuple contract so an observed request class cannot escape into another structurally valid decision branch.

**Architecture:** Add one shared `exclusive_tuple` policy constant and render it once in the Full-only semantic contrast protocol. Change each contrast line from a non-exhaustive correct/forbidden presentation to a unique-admitted-tuple presentation while retaining existing forbidden arrays only as known error examples.

**Tech Stack:** TypeScript, Node.js test runner, LangChain system-message construction, existing schema-derived Orchestrator and Router types.

## Global Constraints

- Do not change any admitted semantic contrast tuple, fixture, expectation, Gate metric, threshold, retry, timeout, or Provider setting.
- Do not change Orchestrator or Router Zod schemas, `invokeStructured()`, decision consistency, DAG, Query Scope, Resource Readiness Guard, or Mapper.
- Do not add output repair, automatic Legacy fallback, a second Router, execution, database access, or business mutation.
- Keep the policy Full-only; the Residual Planner must not render the marker, policy, or cases.
- Do not enumerate the entire schema allowlist into each forbidden array.
- Do not add dependencies or retain raw Provider prompts, responses, reasoning, credentials, or evaluation artifacts.
- Do not call DeepSeek during implementation or deterministic verification.
- A subsequent Acceptance 33 run requires separate Provider data disclosure and approval.

---

### Task 1: Render exclusive admitted tuples

**Files:**
- Modify: `tests/agent/orchestration/orchestrator-semantic-contrast-protocol.test.ts`
- Modify: `src/lib/agent/orchestration/orchestrator-intent-family-protocol.ts`

**Interfaces:**
- Consumes: `ORCHESTRATOR_SEMANTIC_CONTRASTS`, `ORCHESTRATOR_SEMANTIC_CONTRAST_PROTOCOL`, and `buildLangChainSystemPrompt()`.
- Produces: `ORCHESTRATOR_SEMANTIC_CONTRAST_MATCH_POLICY` with literal value `exclusive_tuple`, one Full-only policy header, and one uniquely admitted complete tuple per contrast line.

- [ ] **Step 1: Add the focused failing contract test**

Add this namespace import to
`tests/agent/orchestration/orchestrator-semantic-contrast-protocol.test.ts`:

```ts
import * as orchestratorIntentFamilyProtocol from
  "../../../src/lib/agent/orchestration/orchestrator-intent-family-protocol";
```

Append this test:

```ts
test("treats every matching contrast as an exclusive admitted tuple", () => {
  assert.equal(
    Reflect.get(
      orchestratorIntentFamilyProtocol,
      "ORCHESTRATOR_SEMANTIC_CONTRAST_MATCH_POLICY",
    ),
    "exclusive_tuple",
  );

  const prompt = buildLangChainSystemPrompt();
  assert.match(prompt, /matchPolicy=exclusive_tuple/);
  assert.match(
    prompt,
    /所有其他 decisionCode、mode、intent 序列、task 数量或 task shape 均禁止/,
  );

  for (const contrast of ORCHESTRATOR_SEMANTIC_CONTRASTS) {
    const line = ORCHESTRATOR_SEMANTIC_CONTRAST_PROTOCOL
      .split("\n")
      .find((candidate) => candidate.includes(`[${contrast.id}]`));

    assert.ok(line, contrast.id);
    assert.match(line, /唯一允许的完整输出：/, contrast.id);
    assert.match(
      line,
      new RegExp(`decisionCode=${contrast.admitted.decisionCode}`),
      contrast.id,
    );
    assert.match(
      line,
      new RegExp(`mode=${contrast.admitted.mode}`),
      contrast.id,
    );
    assert.match(
      line,
      new RegExp(`intents=${contrast.admitted.intents.join(",")}`),
      contrast.id,
    );
    assert.match(line, /已知错误示例：/, contrast.id);
  }
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

Expected: FAIL because the exported match policy is absent and the current
renderer has no `matchPolicy=exclusive_tuple` or unique-output wording.

- [ ] **Step 3: Add the shared policy constant**

In
`src/lib/agent/orchestration/orchestrator-intent-family-protocol.ts`, directly
after `ORCHESTRATOR_SEMANTIC_CONTRAST_MARKER`, add:

```ts
export const ORCHESTRATOR_SEMANTIC_CONTRAST_MATCH_POLICY =
  "exclusive_tuple" as const;
```

- [ ] **Step 4: Make each contrast line exclusive**

Replace `renderContrast` with:

```ts
const renderContrast = (
  contrast: OrchestratorSemanticContrast,
): string => {
  const forbiddenDecisionCodes =
    contrast.forbiddenDecisionCodes.length === 0
      ? "无"
      : contrast.forbiddenDecisionCodes.join(",");
  const forbiddenIntents = contrast.forbiddenIntents.length === 0
    ? "无"
    : contrast.forbiddenIntents.join(",");

  return `- [${contrast.id}] ${contrast.requestPattern}`
    + ` 唯一允许的完整输出：decisionCode=${contrast.admitted.decisionCode};`
    + ` mode=${contrast.admitted.mode};`
    + ` intents=${contrast.admitted.intents.join(",")}.`
    + ` 已知错误示例：禁止 decisionCode=${forbiddenDecisionCodes};`
    + ` 禁止 intents=${forbiddenIntents}. ${contrast.reason}`;
};
```

Do not change any contrast entry or admitted tuple.

- [ ] **Step 5: Render the Full-only policy header**

Replace `ORCHESTRATOR_SEMANTIC_CONTRAST_PROTOCOL` with:

```ts
export const ORCHESTRATOR_SEMANTIC_CONTRAST_PROTOCOL = [
  ORCHESTRATOR_SEMANTIC_CONTRAST_MARKER,
  `- matchPolicy=${ORCHESTRATOR_SEMANTIC_CONTRAST_MATCH_POLICY}；当一个 case 条件匹配时，admitted decisionCode、mode 与有序 intents 是唯一允许的完整输出；所有其他 decisionCode、mode、intent 序列、task 数量或 task shape 均禁止。`,
  ...ORCHESTRATOR_SEMANTIC_CONTRASTS.map(renderContrast),
].join("\n");
```

- [ ] **Step 6: Run the focused contract test and verify GREEN**

Run the Step 2 command again.

Expected: all semantic contrast tests PASS. The admitted tuples and bounded
known-error arrays remain unchanged.

- [ ] **Step 7: Run focused Full/Residual boundary regressions**

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

Expected: all focused tests PASS. Full renders the policy; Residual still
excludes the semantic contrast marker and cases; Resource Guard and Mapper
fail-closed behavior remain unchanged.

- [ ] **Step 8: Run type and whitespace verification**

Run:

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG npm run typecheck
git diff --check
git status --short --branch
```

Expected: typecheck PASS, whitespace check produces no output, and only the
two scoped files are modified.

- [ ] **Step 9: Inspect protected paths and commit**

Run:

```bash
git diff --name-only
git diff -- \
  src/lib/agent/orchestration/orchestrator-intent-family-protocol.ts \
  tests/agent/orchestration/orchestrator-semantic-contrast-protocol.test.ts
git add \
  src/lib/agent/orchestration/orchestrator-intent-family-protocol.ts \
  tests/agent/orchestration/orchestrator-semantic-contrast-protocol.test.ts
git diff --cached --check
git commit -m "fix(agent): make semantic contrasts exclusive"
git rev-parse HEAD
git status --short --branch
```

Expected: no fixture, Gate, validator, Mapper, runtime-default, or Provider
configuration file appears; one implementation commit is created; the
worktree is clean.

- [ ] **Step 10: Prepare but do not execute Acceptance 33**

Preserve the failed baseline report:

```bash
if test -e /tmp/l3b-r8-production-acceptance.json; then
  mv \
    /tmp/l3b-r8-production-acceptance.json \
    /tmp/l3b-r8-production-acceptance-7c441ca-failed.json
fi
```

Resolve the exact clean HEAD and evaluation configuration hash:

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

Run the no-network preflight:

```bash
env -u DATABASE_URL -u AGENT_DEBUG_LOG -u AGENT_DISABLE_LLM \
  -u DEEPSEEK_API_KEY \
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

Expected: preflight status is ready with `providerAttempts=0`. Record the
exact HEAD, configuration hash, 33 fixture IDs, maximum 34 logical calls, and
maximum 65 Provider attempts. Stop and request separate informed approval
before any DeepSeek request.
