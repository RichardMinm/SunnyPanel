# Production Dead-Code Retirement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire the top-level `AGENT_GRAPH_RUNTIME=legacy` runner and delete only production files proven unreachable, while preserving VibeCoding documents, current Query compatibility, deterministic safety boundaries, migrations, generated artifacts, and protected tests.

**Architecture:** The HTTP entrypoint will call the production Full LangGraph adapter directly. Shared pipeline dependency types move into a small type-only module so the 2,000-line Legacy runner can be deleted without coupling the Full adapter to deleted code. A conservative production-root reachability audit supplies the remaining deletion list; current product/test contracts override zero-reference results.

**Tech Stack:** TypeScript 5, Next.js 16 App Router, React 19, Payload CMS 3, LangGraph 1, Node test runner, ESLint.

## Global Constraints

- Audit tracked production code only.
- Do not delete `docs/**`, `CLAUDE.md`, `CLAUDE.*`, `.claude/**`, migrations, generated artifacts, test fixtures, or the untracked `outputs/**` directory.
- Documentation may be corrected, but no VibeCoding-related document may be deleted.
- Retire only the top-level `AGENT_GRAPH_RUNTIME=legacy` path.
- Preserve `AGENT_QUERY_RUNTIME=legacy`, Query gate rejection behavior, `AGENT_REQUIRE_LLM` compatibility, Orchestrator runtime gates, Session Coordinator contracts, and Hybrid/L3B evaluation contracts.
- Preserve Draft, Dry-run, Policy Guard, confirmation, execute, receipt, rollback, checkpoint, event replay, and cancellation behavior.
- Do not change Payload schema or create/delete migrations.
- Do not delete or weaken protected tests; replace Legacy-only assertions with current Full LangGraph coverage.
- Preserve all unrelated user changes and the untracked `outputs/**` directory.

## Docs Reviewed

- `docs/README.md`: defines the protected VibeCoding document pack.
- `docs/product-map.md`: defines P0 surfaces and read/write boundaries.
- `docs/feature-index.md`: protects P0 behavior from cleanup regressions.
- `docs/agent-workflow-v1.md`: freezes the write-safety lifecycle.
- `docs/safety-model.md`: protects deterministic and data-safety boundaries.
- `docs/system-architecture.md`: defines runtime and persistence ownership.
- `docs/query-runtime-v1.md`: requires the separate Query Legacy rejection path.
- `docs/testing-strategy.md`: defines verification layers and protected tests.
- `tests/TEST_MAP.md`: identifies protected runtime, Query, planning, schedule, and safety groups.

## Docs Conflicts

- `docs/query-runtime-v1.md` forbids Query Legacy removal. Resolution: keep Query Legacy; the user authorization applies only to `AGENT_GRAPH_RUNTIME=legacy`.
- `docs/agent-runtime-migration-audit.md` records the top-level Legacy runner as a temporary rollback path and already identifies `langgraph/runtime.ts` plus `workflow/executor.ts` as deletion candidates. Resolution: preserve the local historical audit unchanged and record the new state in `docs/dead-code-retirement-report.md`.

## File Structure

- `src/lib/agent/chat-pipeline/runtime-deps.ts`: type-only shared contract for the HTTP handler, production adapter, and Full adapter.
- `src/lib/agent/chat-pipeline/handle-agent-chat-post.ts`: sole HTTP-to-Full-LangGraph production selection and failure handling.
- `src/lib/agent/langgraph/production-adapter.ts`: production step assembly using the shared dependency type.
- `src/lib/agent/langgraph/full-adapter.ts`: Full LangGraph implementation using the shared dependency type.
- `tests/content/dead-code-retirement.test.ts`: deletion and active-replacement source contract.
- `docs/dead-code-retirement-report.md`: versioned evidence, deleted/retained/deferred classifications, and verification results.

---

### Task 1: Exclude protected nested worktrees from repository lint

**Files:**
- Modify: `eslint.config.mjs`

**Interfaces:**
- Consumes: ESLint flat-config `globalIgnores()`.
- Produces: `npm run lint` evaluates the current checkout but not `.claude/worktrees/**`.

- [ ] **Step 1: Reproduce the baseline lint failure**

Run:

```bash
npm run lint
```

Expected: FAIL because ESLint traverses `.claude/worktrees/phase-o1a-orchestrator-prompt` and reports the pre-existing `no-explicit-any` error in that protected nested worktree. Warnings in the main checkout are non-fatal.

- [ ] **Step 2: Add the protected worktree ignore**

Add this exact entry to the existing `globalIgnores()` array:

```js
".claude/worktrees/**",
```

Do not edit any file under `.claude/**`.

- [ ] **Step 3: Verify repository lint uses the intended boundary**

Run:

```bash
npm run lint
```

Expected: PASS. Existing main-checkout warnings may remain; there must be zero errors and no file below `.claude/worktrees/**` in the output.

- [ ] **Step 4: Commit**

```bash
git add eslint.config.mjs
git commit -m "chore: exclude protected local worktrees from lint"
```

### Task 2: Make Full LangGraph the sole top-level Agent runtime

**Files:**
- Create: `src/lib/agent/chat-pipeline/runtime-deps.ts`
- Modify: `src/lib/agent/chat-pipeline/build-context-step.ts`
- Modify: `src/lib/agent/chat-pipeline/handle-agent-chat-post.ts`
- Modify: `src/lib/agent/langgraph/production-adapter.ts`
- Modify: `src/lib/agent/langgraph/full-adapter.ts`
- Delete: `src/lib/agent/chat-pipeline/run-agent-chat-pipeline.ts`
- Delete: `src/lib/agent/langgraph/config.ts`
- Delete: `src/lib/agent/langgraph/dispatcher.ts`
- Delete: `src/lib/agent/langgraph/runtime.ts`
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `tests/agent/langgraph-runtime.test.ts`
- Modify: `tests/agent/langgraph-failure-response.test.ts`
- Modify: `tests/agent/orchestration/http-cancellation-propagation.test.ts`
- Modify: `tests/agent/planning/checklist-draft-flow.test.ts`
- Modify: `tests/agent/planning/prepare-checklist-creation.test.ts`
- Modify: `tests/agent/planning/prepare-plan-creation.test.ts`
- Modify: `tests/agent/planning/revise-plan-draft-flow.test.ts`
- Modify: `tests/agent/schedule/prepare-schedule-creation.test.ts`
- Modify: `tests/agent/schedule/schedule-draft-message.test.tsx`

**Interfaces:**
- Consumes: authenticated `handleAgentChatPost()` request state and the existing production `FullLangGraphAdapterSteps`.
- Produces: `ContextPreferences`, `RunAgentChatPipelineDeps`, and a single call to `createRunProductionLangGraphAgentChatPipeline()`.
- Preserves: `buildLangGraphFailureResponse()`, caller `AbortSignal`, `AgentTurnFinalizer`, model-call accounting, checkpointing, receipts, rollback, and stream envelopes.

- [ ] **Step 1: Write the sole-runtime regression contract**

Replace the obsolete config/minimal-graph cases in `tests/agent/langgraph-runtime.test.ts` with:

```ts
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("the chat entrypoint has one Full LangGraph runtime", () => {
  const source = read("src/lib/agent/chat-pipeline/handle-agent-chat-post.ts");

  assert.match(source, /createRunProductionLangGraphAgentChatPipeline\(pipelineDeps\)/);
  assert.doesNotMatch(source, /createRunAgentChatPipeline/);
  assert.doesNotMatch(source, /createAgentRuntimeRunner/);
  assert.doesNotMatch(source, /getAgentGraphRuntimeConfig/);
  assert.doesNotMatch(source, /runtimeConfig\.mode/);
});

test("retired top-level runtime files stay absent", () => {
  for (const path of [
    "src/lib/agent/chat-pipeline/run-agent-chat-pipeline.ts",
    "src/lib/agent/langgraph/config.ts",
    "src/lib/agent/langgraph/dispatcher.ts",
    "src/lib/agent/langgraph/runtime.ts",
  ]) {
    assert.equal(existsSync(path), false, path);
  }
});

test("production step assembly still uses the Full adapter", () => {
  const source = read("src/lib/agent/langgraph/production-adapter.ts");

  assert.match(source, /createRunFullLangGraphAgentChatPipeline/);
  assert.match(source, /runBuildContextStep/);
  assert.match(source, /runResolveIntentStep/);
  assert.match(source, /runDryRunAndProposeStep/);
  assert.match(source, /runExecuteAndPersistStep/);
});
```

Update `tests/agent/langgraph-failure-response.test.ts` so its handler source test asserts `buildLangGraphFailureResponse()` is the sole non-stream runtime failure builder and that the handler contains no `runtimeConfig.mode`.

Run:

```bash
PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 AGENT_DISABLE_LLM=1 node --import tsx --test tests/agent/langgraph-runtime.test.ts tests/agent/langgraph-failure-response.test.ts
```

Expected: FAIL because the four retired files still exist and the handler still imports the selector.

- [ ] **Step 2: Extract the shared type-only dependency contract**

Create `src/lib/agent/chat-pipeline/runtime-deps.ts` with these exports:

```ts
import type { Payload } from "payload";

import type { generateIntentWithAgentModel } from "@/lib/agent/client";
import type { StructuredConfirmation } from "@/lib/agent/chat-pipeline/confirmation-step";
import type { AgentConversationState } from "@/lib/agent/conversation/types";
import type { ModelCallBudgetRecorder } from "@/lib/agent/orchestration/model-call-budget";
import type {
  AgentChatMessage,
  AgentChatResponse,
  AgentEngine,
  PendingAction,
} from "@/lib/agent/schemas";
import type { AgentPerformanceTimer } from "@/lib/agent/trace/perf-trace";
import type { AgentTurnFinalizer } from "@/lib/agent/turn-finalizer";
import type { UserPreferences } from "@/lib/agent/user-preferences";
import type { AgentWorkbenchMode } from "@/lib/agent/workbench-mode";
import type { AgentThread } from "@/payload-types";

export type ContextPreferences = {
  excluded: string[];
  pinned: string[];
};

export type RunAgentChatPipelineDeps = {
  baseTokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
  contextPreferences?: ContextPreferences | null;
  conversationState?: AgentConversationState | null;
  finalizeTurn?: AgentTurnFinalizer;
  generateIntentWithAgentModel: typeof generateIntentWithAgentModel;
  intentModelEngine: AgentEngine;
  message: string;
  modelCallRecorder?: ModelCallBudgetRecorder;
  payload: Payload;
  pendingAction: null | PendingAction;
  perfTimer?: AgentPerformanceTimer | null;
  resolvedHistory: AgentChatMessage[];
  signal?: AbortSignal;
  structuredConfirmation: null | StructuredConfirmation;
  thread: AgentThread;
  turnId?: string;
  user: { id: number };
  userPreferences?: UserPreferences | null;
  workbenchMode?: AgentWorkbenchMode | null;
};
```

Update `build-context-step.ts`, `handle-agent-chat-post.ts`, `production-adapter.ts`, and `full-adapter.ts` to import these types from `runtime-deps.ts`.

- [ ] **Step 3: Remove runtime selection and the Legacy runner**

In `handle-agent-chat-post.ts`:

- Remove imports of `createRunAgentChatPipeline`, `getAgentGraphRuntimeConfig`, and `createAgentRuntimeRunner`.
- Replace the selector construction with:

```ts
const selectedRunner =
  createRunProductionLangGraphAgentChatPipeline(pipelineDeps);
```

- Keep the existing wrapper that adds performance traces and handles Query/conversational stream failures.
- Replace the conditional runtime failure response with:

```ts
const response = buildLangGraphFailureResponse({
  baseTokenUsage,
  error,
  pendingAction,
  threadId: thread.id,
  workbenchMode,
});
```

Delete:

```text
src/lib/agent/chat-pipeline/run-agent-chat-pipeline.ts
src/lib/agent/langgraph/config.ts
src/lib/agent/langgraph/dispatcher.ts
src/lib/agent/langgraph/runtime.ts
```

- [ ] **Step 4: Retarget Legacy-only assertions without weakening current coverage**

- In `tests/agent/orchestration/http-cancellation-propagation.test.ts`, remove only the first `legacy runner terminates...` test and its `createRunAgentChatPipeline` import. Existing tests in `tests/agent/langgraph-full-adapter.test.ts` already cover both already-aborted input and mid-orchestration cancellation.
- In the four planning/schedule preparation files, point source-order assertions at `src/lib/agent/langgraph/full-adapter.ts` and rename them from “legacy pipeline” to “Full LangGraph adapter”.
- In `checklist-draft-flow.test.ts` and `revise-plan-draft-flow.test.ts`, remove the duplicated Legacy source-order block while keeping the adjacent Full LangGraph source-order test and behavioral adapter test.
- In `schedule-draft-message.test.tsx`, remove `legacyPipelinePath` and assert scheduling-draft projection only against `full-adapter.ts`.
- Do not delete any protected test file.

Run:

```bash
PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 AGENT_DISABLE_LLM=1 node --import tsx --test tests/agent/langgraph-runtime.test.ts tests/agent/langgraph-failure-response.test.ts tests/agent/langgraph-full-adapter.test.ts tests/agent/orchestration/http-cancellation-propagation.test.ts tests/agent/planning/checklist-draft-flow.test.ts tests/agent/planning/prepare-checklist-creation.test.ts tests/agent/planning/prepare-plan-creation.test.ts tests/agent/planning/revise-plan-draft-flow.test.ts tests/agent/schedule/prepare-schedule-creation.test.ts tests/agent/schedule/schedule-draft-message.test.tsx
```

Expected: PASS with zero failures.

- [ ] **Step 5: Remove stale top-level runtime instructions without deleting documents**

- Delete `AGENT_GRAPH_RUNTIME=langgraph` and the commented Legacy example from `.env.example`.
- In the Agent state section of `README.md`, replace the two runtime-selection
  bullets with:

```text
顶层 Agent runtime 固定使用 LangGraph。运行时回滚通过部署上一版本完成，不提供进程内 Legacy 切换。
```

- Remove the `AGENT_GRAPH_RUNTIME` item from the Vercel environment-variable
  list and production checklist.
- Replace the emergency environment-switch paragraph with:

```text
如需回滚顶层 Agent runtime，请部署上一已验证版本；当前版本不提供进程内 Legacy 切换。
```

- Preserve `docs/agent-runtime-migration-audit.md` unchanged as a local
  historical audit. The new versioned retirement report in Task 5 records the
  current state.

Verify:

```bash
rg -n "AGENT_GRAPH_RUNTIME" src .env.example README.md
```

Expected: no matches.

- [ ] **Step 6: Verify the runtime retirement**

Run:

```bash
npm run typecheck
```

Expected: PASS.

Run:

```bash
npm run test:agent
```

Expected: PASS with zero failed tests; environment-conditional DB tests may skip.

- [ ] **Step 7: Commit**

```bash
git add .env.example README.md src/lib/agent/chat-pipeline src/lib/agent/langgraph tests/agent
git commit -m "refactor(agent): retire top-level legacy runtime"
```

### Task 3: Delete unreachable UI and editor components

**Files:**
- Create: `tests/content/dead-code-retirement.test.ts`
- Modify: `src/components/dashboard/writing/WritingEditorPane.tsx`
- Modify: `tests/agent/writing-assist.test.ts`
- Modify: `tests/writing/phase-w1-writing-page-critical-ux.test.ts`
- Delete: `src/components/content-editor/EditorBubbleMenu.tsx`
- Delete: `src/components/content-editor/EditorToolbar.tsx`
- Delete: `src/components/content-editor/WritingEmptyQuickActions.tsx`
- Delete: `src/components/dashboard/agent/AgentReviewCard.tsx`
- Delete: `src/components/dashboard/agent/AgentReviewPanel.tsx`
- Delete: `src/components/dashboard/agent/AgentSuggestionChips.tsx`
- Delete: `src/components/dashboard/writing/WritingLibraryFilters.tsx`
- Delete: `src/components/dashboard/writing/WritingLibraryGroup.tsx`
- Delete: `src/components/dashboard/writing/WritingOutlinePanel.tsx`
- Delete: `src/components/dashboard/writing/WritingPreviewPanel.tsx`
- Delete: `src/components/editor/MarkdownEditorField.tsx`
- Delete: `src/components/public/UpdateCard.tsx`
- Delete: `src/components/shared/ThemeCycleButton.tsx`

**Interfaces:**
- Consumes: active `ContentEditor`, `FloatingFormatMenu`, slash-command AI actions, `WritingCategoryGroup`, `WritingUncategorizedGroup`, `WritingPreviewPane`, `ThemeToggle`, and `PaletteToggle`.
- Produces: an absence contract for 13 unreachable components and removes an unreachable selection-replacement branch from `WritingEditorPane`.
- Preserves: active TipTap editing, slash commands, document-level AI assistance, writing workflow actions, publishing, preview, and theme controls.

- [ ] **Step 1: Write the failing unreachable-component contract**

Create `tests/content/dead-code-retirement.test.ts`:

```ts
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const retiredUiPaths = [
  "src/components/content-editor/EditorBubbleMenu.tsx",
  "src/components/content-editor/EditorToolbar.tsx",
  "src/components/content-editor/WritingEmptyQuickActions.tsx",
  "src/components/dashboard/agent/AgentReviewCard.tsx",
  "src/components/dashboard/agent/AgentReviewPanel.tsx",
  "src/components/dashboard/agent/AgentSuggestionChips.tsx",
  "src/components/dashboard/writing/WritingLibraryFilters.tsx",
  "src/components/dashboard/writing/WritingLibraryGroup.tsx",
  "src/components/dashboard/writing/WritingOutlinePanel.tsx",
  "src/components/dashboard/writing/WritingPreviewPanel.tsx",
  "src/components/editor/MarkdownEditorField.tsx",
  "src/components/public/UpdateCard.tsx",
  "src/components/shared/ThemeCycleButton.tsx",
] as const;

test("unreachable UI modules stay retired", () => {
  for (const path of retiredUiPaths) {
    assert.equal(existsSync(path), false, path);
  }
});

test("active replacements remain wired", () => {
  const editor = readFileSync("src/components/content-editor/ContentEditor.tsx", "utf8");
  const library = readFileSync("src/components/dashboard/writing/WritingLibrary.tsx", "utf8");
  const workspace = readFileSync("src/components/dashboard/writing/WritingWorkspace.tsx", "utf8");

  assert.match(editor, /FloatingFormatMenu/);
  assert.match(editor, /SlashCommandList/);
  assert.match(library, /WritingCategoryGroup/);
  assert.match(library, /WritingUncategorizedGroup/);
  assert.match(workspace, /WritingPreviewPane/);
});
```

Run:

```bash
node --import tsx --test tests/content/dead-code-retirement.test.ts
```

Expected: FAIL because all 13 obsolete files still exist.

- [ ] **Step 2: Retarget writing-assist contracts to the active editor**

In `tests/agent/writing-assist.test.ts`:

- Replace reads of `EditorBubbleMenu.tsx` and `WritingEmptyQuickActions.tsx` with `ContentEditor.tsx` and `slash-commands.ts`.
- Assert `ContentEditor` passes `onWritingAssist` into slash handlers.
- Assert slash commands expose `AI 续写`, `总结本文`, and `改写`.
- Remove the obsolete selection-only `replaceSelection` test.
- Keep API, prompt, outline, error, memory, and core LLM-layer tests unchanged.

In `tests/writing/phase-w1-writing-page-critical-ux.test.ts`:

- Replace both “file still exists” assertions with `assert.equal(existsSync("src/components/content-editor/WritingEmptyQuickActions.tsx"), false)`.
- Add `existsSync` to the `node:fs` import.
- Keep all active ContentEditor and layout assertions.

- [ ] **Step 3: Remove the unreachable editor branch and files**

In `WritingEditorPane.tsx`:

- Delete `WritingAssistExtra`.
- Change `handleAssist` to accept only `(action: WritingAssistAction)`.
- Remove `text: extra?.text` from the `runAssist` input.
- Remove the unreachable `extra?.text && extra.replaceSelection` branch.
- Remove `rememberStyle` from the `useWritingAssist()` destructuring and callback dependencies.

Delete the 13 files listed in this task. Do not delete their active replacement files or CSS.

- [ ] **Step 4: Run focused UI/content verification**

Run:

```bash
PAYLOAD_SECRET=sunnypanel-agent-test-secret-2026 AGENT_DISABLE_LLM=1 node --import tsx --test tests/content/dead-code-retirement.test.ts tests/agent/writing-assist.test.ts tests/writing/phase-w1-writing-page-critical-ux.test.ts
```

Expected: PASS with zero failures.

Run:

```bash
npm run test:content
```

Expected: PASS with zero failures.

- [ ] **Step 5: Commit**

```bash
git add src/components tests/agent/writing-assist.test.ts tests/content/dead-code-retirement.test.ts tests/writing/phase-w1-writing-page-critical-ux.test.ts
git commit -m "refactor(ui): remove unreachable editor and dashboard components"
```

### Task 4: Delete orphan production helpers

**Files:**
- Modify: `tests/content/dead-code-retirement.test.ts`
- Modify: `tests/content/dashboard-content-api.test.ts`
- Delete: `src/components/dashboard/calendar-utils.ts`
- Delete: `src/lib/agent/chat-pipeline/intent-trace.ts`
- Delete: `src/lib/agent/workflow/executor.ts`
- Delete: `src/lib/dashboard/dashboard-href.ts`
- Delete: `src/lib/editor/upload-dashboard-media.ts`
- Delete: `src/lib/payload/markdown-fields.ts`

**Interfaces:**
- Consumes: current dashboard URL synchronization, active upload helper `upload-dashboard-image.ts`, current Agent trace builders, and current capability execution paths.
- Produces: absence contract for six zero-production-caller helpers.
- Preserves: `useDashboardUrlThreadSync`, `getDashboardEditHref`, `uploadDashboardImage`, capability adapters, current trace events, and active Payload rich-content fields.

- [ ] **Step 1: Extend the failing deletion contract**

Add this exact array to `tests/content/dead-code-retirement.test.ts` and assert every path is absent:

```ts
const retiredHelperPaths = [
  "src/components/dashboard/calendar-utils.ts",
  "src/lib/agent/chat-pipeline/intent-trace.ts",
  "src/lib/agent/workflow/executor.ts",
  "src/lib/dashboard/dashboard-href.ts",
  "src/lib/editor/upload-dashboard-media.ts",
  "src/lib/payload/markdown-fields.ts",
] as const;
```

Add active replacement assertions:

```ts
const urlSync = readFileSync(
  "src/components/dashboard/agent-chat/use-dashboard-url-thread-sync.ts",
  "utf8",
);
const upload = readFileSync("src/lib/editor/upload-dashboard-image.ts", "utf8");

assert.match(urlSync, /new URLSearchParams/);
assert.match(urlSync, /params\.set\("threadId"/);
assert.match(upload, /\/api\/editor\/upload-media/);
```

Run:

```bash
node --import tsx --test tests/content/dead-code-retirement.test.ts
```

Expected: FAIL because the six orphan helpers still exist.

- [ ] **Step 2: Remove the obsolete dashboard-href test**

In `tests/content/dashboard-content-api.test.ts`:

- Remove the `buildDashboardHref` import.
- Remove only the test named `Dashboard href preserves non-agent workspace modes while syncing threads`.
- Keep `getDashboardEditHref`, auth redirect, API, schema, and stale-update tests.
- Rely on the existing `tests/agent/dashboard.test.ts` source contract for `useDashboardUrlThreadSync` plus the active replacement assertions added above.

- [ ] **Step 3: Delete the six orphan helpers**

Delete exactly the six files listed in this task. Do not delete:

```text
src/components/layout/index.ts
src/components/primitives/index.ts
src/lib/agent/capabilities/index.ts
src/lib/agent/llm/index.ts
src/lib/agent/llm/schemas/task-output-ref.ts
```

Those barrels/types remain protected or deferred despite having no current production importer.

- [ ] **Step 4: Verify the helper deletion**

Run:

```bash
node --import tsx --test tests/content/dead-code-retirement.test.ts tests/content/dashboard-content-api.test.ts tests/agent/dashboard.test.ts
```

Expected: PASS with zero failures.

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src tests/content
git commit -m "refactor: remove orphan production helpers"
```

### Task 5: Record the evidence and deferred candidates

**Files:**
- Create: `docs/dead-code-retirement-report.md`
- Modify: `tests/TEST_MAP.md`

**Interfaces:**
- Consumes: the 713-file production-root scan, repository searches, docs contracts, focused verification, and final diff.
- Produces: a versioned deletion ledger and an updated test-map entry for `dead-code-retirement.test.ts`.

- [ ] **Step 1: Write the audit report**

Create `docs/dead-code-retirement-report.md` with these exact sections:

```md
# Production Dead-Code Retirement Report

## Scope

Tracked production code only. Migrations, generated artifacts, tests as
independent candidates, VibeCoding documents, `.claude/**`, and `outputs/**`
were excluded from candidate generation.

## Evidence Method

- Production roots: Next App Router, Payload config/import map, package scripts,
  build/deployment/evaluation scripts, static imports, dynamic imports,
  registries, and configuration-selected modules.
- Baseline: 713 tracked non-migration code files; 51 files were unreachable
  from production roots before contract classification.
- Zero textual references alone was not accepted as deletion evidence.

## Deleted

- Top-level graph retirement: `run-agent-chat-pipeline.ts`, `langgraph/config.ts`,
  `langgraph/dispatcher.ts`, and obsolete `langgraph/runtime.ts`.
- Unreachable UI/editor modules: the 13 paths locked by
  `tests/content/dead-code-retirement.test.ts`.
- Orphan helpers: the six paths locked by
  `tests/content/dead-code-retirement.test.ts`.

The baseline reachability set contributed 20 deleted files. Three additional
files were production-reachable only through the explicitly retired top-level
Legacy selector, for 23 deleted production files total.

## Retained

- Design-system contracts: `components/layout/index.ts`,
  `components/primitives/index.ts`, `AppCombobox.tsx`,
  `AppSegmentedControl.tsx`, and `AppTextarea.tsx`.
- LLM/capability API surfaces: `agent/capabilities/index.ts`,
  `agent/llm/index.ts`, and `llm/schemas/task-output-ref.ts`.
- Query contracts: `query/intent-scope.ts` and all
  `AGENT_QUERY_RUNTIME=legacy` behavior.
- Session Coordinator subtree: `session/apply-patch.ts`,
  `business-rule-pre-check.ts`, `confirmation-pre-check.ts`, `coordinator.ts`,
  `pipeline-integration.ts`, `reconcile-session.ts`, `router-context.ts`,
  `rule-pre-check.ts`, `transition-engine.ts`, `transition-prompt.ts`,
  `transition-schema.ts`, and `transition-trace.ts`.

## Deferred

- `cognitive-advisory.ts`: test-only production reachability, but still recorded
  as a normal Writing Assist contract in `tests/TEST_MAP.md`.
- `orchestrator-shadow.ts`: test-only reachability, but still recorded as an
  Orchestrator Shadow contract.
- Hybrid focused-gate/query-boundary modules and L3B evaluation/accounting/
  semantic-evidence modules: not request-time production dependencies, but
  explicitly protected evaluation contracts and supported scripts.

## Safety Impact

- No schema or migration change.
- Query Legacy, Policy Guard, confirmation, receipt, rollback, checkpoint,
  event replay, and cancellation contracts remain.
- No VibeCoding document was deleted.

## Verification

Record the fresh command, exit code, pass/fail count, and any environment-only
blocker for typecheck, lint, Agent, Planning, Schedule, Content, build, and
`git diff --check`.
```

Replace the final Verification instruction with the actual observed results after Task 6; do not invent counts.

- [ ] **Step 2: Update the test map**

Add `tests/content/dead-code-retirement.test.ts` to the Content table in `tests/TEST_MAP.md` with this contract:

```text
Retired production modules remain absent while the active editor, writing
library, dashboard URL sync, and upload paths remain wired.
```

Protection: `normal`.

- [ ] **Step 3: Verify report and docs preservation**

Run:

```bash
git diff --name-status
```

Expected:

- No deleted path under `docs/**`, `.claude/**`, `src/migrations/**`, generated output, or `outputs/**`.
- `docs/agent-runtime-migration-audit.md` remains present and unchanged.
- `docs/dead-code-retirement-report.md` is added.

- [ ] **Step 4: Commit**

```bash
git add docs/dead-code-retirement-report.md tests/TEST_MAP.md
git commit -m "docs: record dead-code retirement evidence"
```

### Task 6: Run the full verification matrix

**Files:**
- Modify: `docs/dead-code-retirement-report.md`

**Interfaces:**
- Consumes: all changes from Tasks 1-5.
- Produces: fresh completion evidence; no success claim is allowed without these results.

- [ ] **Step 1: Verify type and lint**

Run:

```bash
npm run typecheck
npm run lint
```

Expected: both commands exit 0. Existing non-fatal warnings must be recorded but do not count as failures.

- [ ] **Step 2: Verify Agent and workflow matrices**

Run each command independently:

```bash
npm run test:agent
npm run test:agent:planning
npm run test:agent:schedule
npm run test:content
```

Expected: every command exits 0 with zero failed tests. Record exact pass/skip counts from fresh output.

- [ ] **Step 3: Verify the production build**

Run:

```bash
npm run build
```

Expected: exit 0. If the build is blocked only by a missing database, Next lock, or other environment prerequisite, record the exact blocker and do not claim the build passed.

- [ ] **Step 4: Verify deletion, docs protection, and diff hygiene**

Run:

```bash
rg -n "AGENT_GRAPH_RUNTIME" src .env.example README.md
git diff --check
git status --short
```

Expected:

- No `AGENT_GRAPH_RUNTIME` match in production code, `.env.example`, or `README.md`.
- `git diff --check` exits 0.
- `outputs/**` remains untracked and untouched.
- No unrelated files appear.

- [ ] **Step 5: Replace the report's verification instruction with actual evidence**

For every command above, record:

- command;
- exit code;
- exact passed/failed/skipped counts when available;
- environment blocker, if any;
- whether the blocker is related to this deletion.

Do not write “passed” for a command that was not run or exited non-zero.

- [ ] **Step 6: Commit the final evidence**

```bash
git add docs/dead-code-retirement-report.md
git commit -m "docs: finalize dead-code retirement verification"
```
