# Dashboard Agent Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/dashboard` default to a Codex-like Agent workspace with left navigation, center conversation/composer, and a productized Context / Approval / Trace right panel.

**Architecture:** Reuse the existing Agent chat pipeline, thread API, pending-action confirmation flow, and Payload collections. Move the Dashboard shell from old card-heavy columns to a workbench host, then productize existing `AgentSidebar`, `AgentInspector`, `AgentApprovalCard`, and trace components without changing the database schema.

**Tech Stack:** Next.js App Router, React 19, Payload CMS 3, TypeScript, Playwright E2E, existing Node test runner for lightweight copy tests, CSS modules through global Sunny CSS files.

---

## File Structure

- Modify `tests/e2e/dashboard-agent.spec.ts`: first write E2E assertions for the new default `/dashboard` workbench, navigation labels, right panel tabs, Composer accessibility, and mobile layout.
- Modify `src/app/(site)/dashboard/page.tsx`: remove old left/right Dashboard content columns from the default route and render the Agent workbench as the primary surface.
- Modify `src/components/dashboard/sections/DashboardAgentChatFullSection.tsx`: expose a stable host landmark and keep `AgentChatPanel` focused as the only Dashboard body.
- Modify `src/components/dashboard/agent/types.ts`: replace product tabs with `context | approval | trace`, while keeping developer tabs available under a separate type for future developer surfaces.
- Modify `src/components/dashboard/agent/constants.ts`: introduce user-facing mode labels and primary inspector tabs.
- Modify `src/components/dashboard/agent/AgentSidebar.tsx`: add workspace navigation, Agent Threads, Pending, Pinned, and stable test ids.
- Create `src/components/dashboard/agent/AgentApprovalPanel.tsx`: show pending actions in the right panel, reusing `AgentChangesPanel` and batch confirmation state.
- Create `src/components/dashboard/agent/AgentTracePanel.tsx`: render trace steps in the right panel from existing `AgentRunTimeline`-style data.
- Modify `src/components/dashboard/agent/AgentInspector.tsx`: use `Context / Approval / Trace` as primary tabs and wire the new panels.
- Modify `src/components/dashboard/AgentChatPanel.tsx`: set default active panel behavior to `context`, `approval`, or `trace`.
- Modify `src/components/dashboard/agent-chat/use-agent-chat-messaging.ts`: redirect post-response active panel behavior from old `changes/artifacts` to `approval/trace`.
- Modify `src/components/dashboard/agent/AgentWorkbench.tsx`: pass the correct props to the new Inspector panel and keep center approval preview.
- Modify `src/components/dashboard/agent/AgentComposer.tsx`: make the status/mode language map to `只回答 / 生成建议 / DryRun / 等待确认 / 可执行`.
- Modify `src/app/styles/sunny-ui.css`: simplify the Dashboard shell into a single Agent host layout.
- Modify `src/app/styles/sunny-agent.css`: polish three-column workbench, sidebar collapsed state, right panel, and mobile behavior.
- Modify `src/lib/site-copy.ts`: make Admin group labels match `内容管理 / 计划与日程 / AI Agent / 设置 / 系统`.
- Create `tests/agent/admin-copy.test.ts`: verify the Admin copy labels are stable.

## Task 1: E2E Contract for the New Dashboard

**Files:**
- Modify: `tests/e2e/dashboard-agent.spec.ts`

- [ ] **Step 1: Write the failing E2E tests**

Replace `tests/e2e/dashboard-agent.spec.ts` with:

```ts
import { expect, test } from "@playwright/test";

async function getWorkbench(page: import("@playwright/test").Page) {
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  const shell = page.getByTestId("agent-workbench");

  test.skip((await shell.count()) === 0, "未检测到 agent-workbench（可能未登录）");

  return shell;
}

test("Dashboard 默认展示 Agent Workspace，而不是旧统计卡片首页", async ({ page }) => {
  const shell = await getWorkbench(page);

  await expect(shell).toBeVisible();
  await expect(page.getByTestId("dashboard-agent-host")).toBeVisible();
  await expect(page.getByText("内容队列")).toHaveCount(0);
  await expect(page.getByText("计划跑道")).toHaveCount(0);
  await expect(page.getByText("阶段时间线")).toHaveCount(0);
});

test("Agent Workspace 左侧包含工作台导航、线程与待确认区域", async ({ page }) => {
  const shell = await getWorkbench(page);

  await expect(shell.getByTestId("agent-sidebar")).toBeVisible();
  await expect(shell.getByTestId("agent-workspace-nav")).toContainText("总览");
  await expect(shell.getByTestId("agent-workspace-nav")).toContainText("计划");
  await expect(shell.getByTestId("agent-thread-list")).toBeVisible();
  await expect(shell.getByTestId("agent-pending-list")).toBeVisible();
  await expect(shell.getByTestId("agent-pinned-list")).toBeVisible();
});

test("Agent Workspace 右侧以 Context / Approval / Trace 作为主面板", async ({ page }) => {
  const shell = await getWorkbench(page);

  const inspectorTabs = shell.getByRole("tablist", { name: "Agent 详情面板" });

  await expect(inspectorTabs).toBeVisible();
  await expect(inspectorTabs.getByRole("tab", { name: "Context" })).toBeVisible();
  await expect(inspectorTabs.getByRole("tab", { name: "Approval" })).toBeVisible();
  await expect(inspectorTabs.getByRole("tab", { name: "Trace" })).toBeVisible();
  await expect(inspectorTabs.getByRole("tab", { name: "变更" })).toHaveCount(0);
  await expect(inspectorTabs.getByRole("tab", { name: "产物" })).toHaveCount(0);
});

test("Agent Composer 使用命令式可访问输入", async ({ page }) => {
  const shell = await getWorkbench(page);
  const textarea = shell.getByLabel("输入要交给 Agent 的话");

  await expect(textarea).toBeVisible();
  await expect(shell.getByRole("tablist", { name: "Agent 工作台模式" })).toContainText("只回答");
  await expect(shell.getByRole("button", { name: "发送" })).toBeVisible();
});

test("移动端 Dashboard 优先展示主 Agent Workspace 且不横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  const shell = await getWorkbench(page);

  await expect(shell).toBeVisible();
  await expect(shell.getByLabel("输入要交给 Agent 的话")).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

  expect(overflow).toBe(false);
});
```

- [ ] **Step 2: Run the E2E tests to verify RED**

Run:

```bash
npm run test:e2e -- tests/e2e/dashboard-agent.spec.ts
```

Expected: at least one assertion fails because `/dashboard` still renders old Dashboard cards and the right panel still uses old tab labels such as `变更` and `产物`.

- [ ] **Step 3: Commit the failing contract**

Run:

```bash
git add tests/e2e/dashboard-agent.spec.ts
git commit -m "test: define dashboard agent workspace contract"
```

## Task 2: Make `/dashboard` a Single Agent Workspace Host

**Files:**
- Modify: `src/app/(site)/dashboard/page.tsx`
- Modify: `src/components/dashboard/sections/DashboardAgentChatFullSection.tsx`
- Test: `tests/e2e/dashboard-agent.spec.ts`

- [ ] **Step 1: Re-run the focused failing test**

Run:

```bash
npm run test:e2e -- tests/e2e/dashboard-agent.spec.ts --grep "默认展示 Agent Workspace"
```

Expected: FAIL because old modules such as `内容队列` or `计划跑道` still appear.

- [ ] **Step 2: Replace the Dashboard page body**

Replace `src/app/(site)/dashboard/page.tsx` with:

```tsx
import { DashboardWorkspaceChrome } from "@/components/dashboard/DashboardWorkspaceChrome";
import { DashboardAgentChatFullSection } from "@/components/dashboard/sections/DashboardAgentChatFullSection";
import { loadDashboardData } from "@/lib/dashboard/load-dashboard-data";

export const dynamic = "force-dynamic";

type DashboardPageProps = {
  searchParams: Promise<{
    threadId?: string;
    week?: string;
  }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const { agentQuickPrompts, agentSuggestions, model } = await loadDashboardData(params);

  return (
    <main className="sunny-dashboard-shell sunny-dashboard-agent-shell">
      <DashboardWorkspaceChrome />
      <DashboardAgentChatFullSection
        initialThreadId={model.initialThreadId}
        quickPrompts={agentQuickPrompts}
        suggestions={agentSuggestions}
      />
    </main>
  );
}
```

- [ ] **Step 3: Add a stable host landmark**

Replace `src/components/dashboard/sections/DashboardAgentChatFullSection.tsx` with:

```tsx
import { AgentChatPanel, type AgentChatPanelProps } from "@/components/dashboard/AgentChatPanelLazy";

type DashboardAgentChatFullSectionProps = Pick<AgentChatPanelProps, "initialThreadId" | "quickPrompts" | "suggestions">;

export function DashboardAgentChatFullSection({ initialThreadId, quickPrompts, suggestions }: DashboardAgentChatFullSectionProps) {
  return (
    <section className="sunny-dashboard-agent-host" data-testid="dashboard-agent-host" aria-label="Agent 工作台">
      <AgentChatPanel initialThreadId={initialThreadId} quickPrompts={quickPrompts} suggestions={suggestions} />
    </section>
  );
}
```

- [ ] **Step 4: Update Dashboard shell CSS**

In `src/app/styles/sunny-ui.css`, replace the `.sunny-dashboard-triple` and `.sunny-dashboard-col-*` Dashboard grid block with:

```css
.sunny-dashboard-agent-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  font-size: var(--text-base);
  line-height: var(--leading-normal);
}

.sunny-dashboard-agent-host {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0.65rem;
  overflow: hidden;
}

.sunny-dashboard-agent-host > .sunny-agent-panel-loading,
.sunny-dashboard-agent-host .sunny-agent-workbench-layout {
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
}

.sunny-dashboard-agent-host .sunny-agent-workbench-layout {
  min-height: min(var(--agent-min-height), 100%);
}
```

Keep old `.sunny-dashboard-card`, `.sunny-collapsible-card`, and section styles because public components and secondary pages still use them.

- [ ] **Step 5: Verify GREEN for the focused Dashboard host test**

Run:

```bash
npm run test:e2e -- tests/e2e/dashboard-agent.spec.ts --grep "默认展示 Agent Workspace"
```

Expected: PASS or SKIP only when unauthenticated.

- [ ] **Step 6: Commit**

Run:

```bash
git add 'src/app/(site)/dashboard/page.tsx' src/components/dashboard/sections/DashboardAgentChatFullSection.tsx src/app/styles/sunny-ui.css
git commit -m "feat: make dashboard an agent workspace host"
```

## Task 3: Productize the Left Sidebar

**Files:**
- Modify: `src/components/dashboard/agent/AgentSidebar.tsx`
- Modify: `src/app/styles/sunny-agent.css`
- Test: `tests/e2e/dashboard-agent.spec.ts`

- [ ] **Step 1: Run the sidebar E2E test to verify RED**

Run:

```bash
npm run test:e2e -- tests/e2e/dashboard-agent.spec.ts --grep "左侧包含工作台导航"
```

Expected: FAIL because the sidebar does not expose `agent-sidebar`, `agent-workspace-nav`, `agent-thread-list`, `agent-pending-list`, and `agent-pinned-list`.

- [ ] **Step 2: Replace the sidebar component**

Replace `src/components/dashboard/agent/AgentSidebar.tsx` with:

```tsx
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import type { AgentQuickPrompt } from "@/lib/agent/quick-prompts";
import type { PendingAction } from "@/lib/agent/schemas";
import type { AgentInboxSuggestion } from "@/lib/agent/suggestions";

import { riskLevelLabelMap } from "./constants";
import { AgentTaskRow } from "./AgentTaskRow";
import type { AgentRunSummary, AgentThreadSummary } from "./types";
import { buildSuggestedTasks, getPendingActionLabel } from "./utils";

type AgentSidebarProps = {
  disabled?: boolean;
  inboxSuggestions: AgentInboxSuggestion[];
  isThinking: boolean;
  onArchiveThread?: (threadId: number, archived: boolean) => void;
  onLoadThread: (threadId: number) => void;
  onNewThread: () => void;
  onRunPrompt: (prompt: string) => void;
  onRunSuggestion: (suggestion: AgentInboxSuggestion) => void;
  onSearchThreads?: (query: string) => void;
  pendingAction: null | PendingAction;
  quickPrompts: AgentQuickPrompt[];
  recentRuns: AgentRunSummary[];
  statusLabel: string;
  threadId: null | number;
  threads: AgentThreadSummary[];
};

const workspaceNav = [
  { href: "/dashboard", label: "总览" },
  { href: "/dashboard", label: "Agent" },
  { href: "/admin/collections/schedule-items", label: "今日" },
  { href: "/admin/collections/plans", label: "计划" },
  { href: "/admin/collections/schedule-items", label: "日程" },
  { href: "/admin/collections/posts", label: "写作" },
  { href: "/admin/collections/agent-memories", label: "记忆" },
] as const;

function getPendingTone(pendingAction: PendingAction | null) {
  if (pendingAction?.type === "await_confirmation") {
    return pendingAction.action.riskLevel === "high"
      ? "danger"
      : pendingAction.action.riskLevel === "medium"
        ? "warning"
        : "success";
  }

  return "warning";
}

export function AgentSidebar({
  disabled,
  inboxSuggestions,
  isThinking,
  onArchiveThread,
  onLoadThread,
  onNewThread,
  onRunPrompt,
  onRunSuggestion,
  onSearchThreads,
  pendingAction,
  quickPrompts,
  recentRuns,
  statusLabel,
  threadId,
  threads,
}: AgentSidebarProps) {
  const [threadSearch, setThreadSearch] = useState("");
  const [showAllThreads, setShowAllThreads] = useState(false);

  const handleSearchChange = useCallback(
    (value: string) => {
      setThreadSearch(value);
      onSearchThreads?.(value);
    },
    [onSearchThreads],
  );

  const visibleThreads = showAllThreads ? threads : threads.slice(0, 8);
  const tasks = buildSuggestedTasks(inboxSuggestions, quickPrompts).slice(0, 5);
  const pinnedItems = useMemo(() => {
    const tags = threads.flatMap((thread) => thread.tags ?? []).filter(Boolean);
    return Array.from(new Set(tags)).slice(0, 5);
  }, [threads]);
  const pendingTone = getPendingTone(pendingAction);

  return (
    <aside className="sunny-agent-left-rail" data-testid="agent-sidebar" aria-label="Agent 任务导航">
      <div className="sunny-agent-rail-head">
        <button type="button" onClick={onNewThread} className="sunny-agent-new-task-button">
          新建 Thread
        </button>
      </div>

      <nav className="sunny-agent-rail-section" data-testid="agent-workspace-nav" aria-label="工作台导航">
        <p className="sunny-agent-rail-label">工作台</p>
        <div className="sunny-agent-workspace-nav-list">
          {workspaceNav.map((item) => (
            <Link key={`${item.label}-${item.href}`} href={item.href} className="sunny-agent-nav-link">
              {item.label}
            </Link>
          ))}
        </div>
      </nav>

      <div className="sunny-agent-rail-section">
        <p className="sunny-agent-rail-label">当前任务</p>
        <AgentTaskRow
          detail={isThinking ? "运行中" : "就绪"}
          label={statusLabel}
          meta={threadId ? `#${threadId}` : null}
          tone={isThinking ? "info" : "success"}
        />
      </div>

      <div className="sunny-agent-rail-section" data-testid="agent-pending-list">
        <p className="sunny-agent-rail-label">待确认</p>
        {pendingAction ? (
          <AgentTaskRow
            detail={getPendingActionLabel(pendingAction)}
            label={pendingAction.type === "await_confirmation" ? pendingAction.action.summary : "需要继续输入"}
            meta="待处理"
            tone={pendingTone}
          />
        ) : (
          <AgentTaskRow detail="没有待确认动作" label="无待办" tone="muted" />
        )}
      </div>

      <div className="sunny-agent-rail-section">
        <p className="sunny-agent-rail-label">建议</p>
        {tasks.length > 0 ? (
          tasks.map((task) => (
            <AgentTaskRow
              key={task.id}
              disabled={disabled}
              detail={task.reason}
              label={task.label}
              meta={task.riskLevel ? riskLevelLabelMap[task.riskLevel] : task.source ?? "Run"}
              onClick={() => {
                if (task.suggestion) {
                  onRunSuggestion(task.suggestion);
                  return;
                }

                onRunPrompt(task.prompt);
              }}
              tone={task.riskLevel === "high" ? "danger" : task.riskLevel === "medium" ? "warning" : "accent"}
            />
          ))
        ) : (
          <AgentTaskRow detail="输入一个目标即可开始" label="暂无建议" tone="muted" />
        )}
      </div>

      <section className="sunny-agent-rail-section" data-testid="agent-thread-list" aria-label="Agent Threads">
        <div className="sunny-agent-rail-section-head">
          <p className="sunny-agent-rail-label">Agent Threads</p>
          <span>{threads.length}</span>
        </div>
        <div className="sunny-agent-thread-search">
          <input
            type="text"
            value={threadSearch}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="搜索 Thread..."
            className="sunny-agent-thread-search-input"
            aria-label="搜索 Agent Thread"
          />
        </div>
        <div className="sunny-agent-rail-detail-list">
          {visibleThreads.map((thread) => (
            <div key={thread.id} className="sunny-agent-thread-row-wrapper">
              <AgentTaskRow
                detail={thread.pendingAction ? getPendingActionLabel(thread.pendingAction) : thread.title}
                label={thread.title || `Thread #${thread.id}`}
                meta={thread.archived ? "归档" : thread.tags?.length ? thread.tags[0] : `#${thread.id}`}
                onClick={() => onLoadThread(thread.id)}
                selected={thread.id === threadId}
                tone={thread.archived ? "muted" : thread.pendingAction ? "warning" : "muted"}
              />
              {onArchiveThread ? (
                <button
                  type="button"
                  className="sunny-agent-thread-archive-btn"
                  title={thread.archived ? "取消归档" : "归档"}
                  onClick={(e) => {
                    e.stopPropagation();
                    onArchiveThread(thread.id, !thread.archived);
                  }}
                >
                  {thread.archived ? "恢复" : "归档"}
                </button>
              ) : null}
            </div>
          ))}
          {!showAllThreads && threads.length > 8 ? (
            <button type="button" className="sunny-agent-thread-show-more" onClick={() => setShowAllThreads(true)}>
              显示全部 ({threads.length})
            </button>
          ) : null}
          {threads.length === 0 ? (
            <AgentTaskRow detail={threadSearch ? "没有匹配的 Thread" : "还没有历史 Thread"} label={threadSearch ? "未找到" : "No threads"} tone="muted" />
          ) : null}
        </div>
      </section>

      <section className="sunny-agent-rail-section" data-testid="agent-pinned-list" aria-label="Pinned">
        <p className="sunny-agent-rail-label">Pinned</p>
        {pinnedItems.length > 0 ? (
          pinnedItems.map((tag) => <AgentTaskRow key={tag} detail="来自 Thread 标签" label={tag} tone="accent" />)
        ) : (
          <AgentTaskRow detail="后续可固定计划、项目和记忆" label="暂无固定对象" tone="muted" />
        )}
      </section>

      <details className="sunny-agent-rail-section sunny-agent-rail-details">
        <summary>最近执行</summary>
        <div className="sunny-agent-rail-detail-list">
          {recentRuns.slice(0, 4).map((run) => (
            <AgentTaskRow
              key={run.id}
              detail={run.summary ?? run.workflow}
              label={run.title}
              meta={run.status}
              tone={run.status === "failed" ? "danger" : run.status === "succeeded" ? "success" : "info"}
            />
          ))}
          {recentRuns.length === 0 ? <AgentTaskRow detail="还没有审计记录" label="No runs" tone="muted" /> : null}
        </div>
      </details>
    </aside>
  );
}
```

- [ ] **Step 3: Add sidebar navigation CSS**

In `src/app/styles/sunny-agent.css`, after `.sunny-agent-rail-section + .sunny-agent-rail-section, .sunny-agent-rail-details`, add:

```css
.sunny-agent-rail-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.sunny-agent-rail-section-head > span {
  color: var(--muted);
  font-size: var(--text-xs);
}

.sunny-agent-workspace-nav-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.35rem;
}

.sunny-agent-nav-link {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  background: var(--agent-control-bg);
  color: var(--foreground);
  padding: 0.3rem 0.45rem;
  font-size: var(--text-sm-compact);
  font-weight: var(--font-weight-ui);
  text-decoration: none;
}

.sunny-agent-nav-link:hover {
  border-color: color-mix(in srgb, var(--accent) 34%, var(--border));
  color: var(--accent-strong);
}
```

- [ ] **Step 4: Verify GREEN for sidebar**

Run:

```bash
npm run test:e2e -- tests/e2e/dashboard-agent.spec.ts --grep "左侧包含工作台导航"
```

Expected: PASS or SKIP only when unauthenticated.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/components/dashboard/agent/AgentSidebar.tsx src/app/styles/sunny-agent.css
git commit -m "feat: add workspace navigation to agent sidebar"
```

## Task 4: Productize Right Panel as Context / Approval / Trace

**Files:**
- Modify: `src/components/dashboard/agent/types.ts`
- Modify: `src/components/dashboard/agent/constants.ts`
- Create: `src/components/dashboard/agent/AgentApprovalPanel.tsx`
- Create: `src/components/dashboard/agent/AgentTracePanel.tsx`
- Modify: `src/components/dashboard/agent/AgentInspector.tsx`
- Modify: `src/components/dashboard/agent/index.ts`
- Modify: `src/components/dashboard/AgentChatPanel.tsx`
- Modify: `src/components/dashboard/agent-chat/use-agent-chat-messaging.ts`
- Modify: `src/components/dashboard/agent/AgentWorkbench.tsx`
- Test: `tests/e2e/dashboard-agent.spec.ts`

- [ ] **Step 1: Run the panel E2E test to verify RED**

Run:

```bash
npm run test:e2e -- tests/e2e/dashboard-agent.spec.ts --grep "右侧以 Context"
```

Expected: FAIL because the inspector tablist is named `检查器分区` and still includes old tabs.

- [ ] **Step 2: Update tab types**

In `src/components/dashboard/agent/types.ts`, replace:

```ts
export type AgentInspectorTab = "artifacts" | "changes" | "context" | "dag" | "debug" | "memory";
```

with:

```ts
export type AgentInspectorTab = "approval" | "context" | "trace";
export type AgentDeveloperInspectorTab = "artifacts" | "dag" | "debug" | "memory";
```

- [ ] **Step 3: Update constants**

In `src/components/dashboard/agent/constants.ts`, replace `modeItems` and `inspectorTabs` with:

```ts
export const modeItems: Array<{ description: string; key: AgentWorkbenchMode; label: string }> = [
  { key: "ask", label: "只回答", description: "不写入数据库，只回答当前问题" },
  { key: "plan", label: "生成建议", description: "生成计划或内容建议，默认不执行" },
  { key: "execute", label: "可执行", description: "允许进入 DryRun 和确认流程" },
  { key: "review", label: "复盘", description: "汇总进展和下一步" },
  { key: "timeline", label: "时间线", description: "整理长期记录和节点" },
];

export const inspectorTabs: Array<{ key: AgentInspectorTab; label: string }> = [
  { key: "context", label: "Context" },
  { key: "approval", label: "Approval" },
  { key: "trace", label: "Trace" },
];
```

- [ ] **Step 4: Create Approval panel**

Create `src/components/dashboard/agent/AgentApprovalPanel.tsx`:

```tsx
import type { PendingAction, ProposedAgentAction } from "@/lib/agent/schemas";

import { AgentChangesPanel } from "./AgentChangesPanel";
import { getPendingActionLabel } from "./utils";

type AgentApprovalPanelProps = {
  action: null | ProposedAgentAction;
  pendingAction: null | PendingAction;
};

export function AgentApprovalPanel({ action, pendingAction }: AgentApprovalPanelProps) {
  if (pendingAction?.type === "await_batch_confirmation") {
    return (
      <div className="sunny-agent-inspector-panel">
        <div className="sunny-agent-inspector-summary">
          <span className="sunny-agent-risk-pill-v2 sunny-agent-risk-medium">批量确认</span>
          <h3>{getPendingActionLabel(pendingAction)}</h3>
          <p>这些操作会在用户确认后按顺序执行。</p>
        </div>
        <div className="sunny-agent-change-list-v2">
          {pendingAction.actions.map((item) => (
            <div key={item.id} className="sunny-agent-change-row">
              <div>
                <span>{item.riskLevel}</span>
                <strong>{item.summary}</strong>
              </div>
              <p>{item.changes[0]?.preview ?? item.toolName ?? item.intent}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (pendingAction?.type === "await_clarification") {
    return (
      <div className="sunny-agent-inspector-panel">
        <div className="sunny-agent-inspector-summary">
          <span className="sunny-agent-risk-pill-v2 sunny-agent-risk-low">等待澄清</span>
          <h3>{pendingAction.question}</h3>
          <p>{pendingAction.missingFields.join(" / ") || pendingAction.intent}</p>
        </div>
      </div>
    );
  }

  if (pendingAction?.type === "await_completion_note") {
    return (
      <div className="sunny-agent-inspector-panel">
        <div className="sunny-agent-inspector-summary">
          <span className="sunny-agent-risk-pill-v2 sunny-agent-risk-low">等待备注</span>
          <h3>{pendingAction.itemTitle}</h3>
          <p>{pendingAction.checklistTitle}</p>
        </div>
      </div>
    );
  }

  return <AgentChangesPanel action={action} />;
}
```

- [ ] **Step 5: Create Trace panel**

Create `src/components/dashboard/agent/AgentTracePanel.tsx`:

```tsx
import type { AgentTraceStep } from "@/lib/agent/schemas";

import { traceKindLabelMap } from "./constants";

type AgentTracePanelProps = {
  statusLabel: string;
  traceSteps: AgentTraceStep[];
};

export function AgentTracePanel({ statusLabel, traceSteps }: AgentTracePanelProps) {
  if (traceSteps.length === 0) {
    return (
      <div className="sunny-agent-inspector-empty">
        <h3>等待执行 Trace</h3>
        <p>{statusLabel || "发送消息后，这里会展示意图识别、上下文构建、DryRun、确认和写入过程。"}</p>
      </div>
    );
  }

  return (
    <div className="sunny-agent-inspector-panel">
      <div className="sunny-agent-trace-panel-list">
        {traceSteps.map((step) => (
          <div key={step.id} className={`sunny-agent-run-step-v2 sunny-agent-run-step-v2-${step.status}`}>
            <span className="sunny-agent-run-step-marker" aria-hidden="true" />
            <div className="sunny-agent-run-step-content">
              <div>
                <span className={`sunny-agent-kind-pill sunny-agent-kind-${step.kind}`}>{traceKindLabelMap[step.kind]}</span>
                <small>{step.status}</small>
              </div>
              <h3>{step.title}</h3>
              {step.detail ? <p>{step.detail}</p> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Wire new panels in Inspector**

In `src/components/dashboard/agent/AgentInspector.tsx`:

1. Import the new panels:

```tsx
import { AgentApprovalPanel } from "./AgentApprovalPanel";
import { AgentTracePanel } from "./AgentTracePanel";
```

Remove the unused imports for the old primary inspector panels:

```tsx
import { AgentArtifactsPanel } from "./AgentArtifactsPanel";
import { AgentChangesPanel } from "./AgentChangesPanel";
import { AgentDebugPanel } from "./AgentDebugPanel";
import { AgentDependencyGraph } from "./AgentDependencyGraph";
import { AgentMemoryPanel } from "./AgentMemoryPanel";
```

2. Change the tablist aria label in `AgentInspectorTabs`:

```tsx
<div className="sunny-agent-inspector-tabs" id={tabListId} role="tablist" aria-label="Agent 详情面板" onKeyDown={handleKeyDown}>
```

3. Replace the old panel conditionals inside `InspectorPanels` with:

```tsx
{activeTab === "context" ? (
  <AgentContextPanel
    contextPreferences={contextPreferences ?? emptyPreferences}
    messages={messages}
    onToggleExclude={onToggleContextExclude ?? noop}
    onTogglePin={onToggleContextPin ?? noop}
    pendingAction={pendingAction}
    statusLabel={statusLabel}
    threadId={threadId}
    traceSteps={traceSteps}
  />
) : null}
{activeTab === "approval" ? <AgentApprovalPanel action={action} pendingAction={pendingAction} /> : null}
{activeTab === "trace" ? <AgentTracePanel statusLabel={statusLabel} traceSteps={traceSteps} /> : null}
```

4. Replace the fallback label:

```tsx
const currentTabLabel = inspectorTabs.find((tab) => tab.key === activeTab)?.label ?? "Context";
```

- [ ] **Step 7: Export the new panels**

Add to `src/components/dashboard/agent/index.ts`:

```ts
export { AgentApprovalPanel } from "./AgentApprovalPanel";
export { AgentTracePanel } from "./AgentTracePanel";
```

- [ ] **Step 8: Update active tab transitions**

In `src/components/dashboard/AgentChatPanel.tsx`, change the pending-action hydration branch:

```tsx
setActiveInspectorTab(
  selectedThread.pendingAction?.type === "await_confirmation" ||
    selectedThread.pendingAction?.type === "await_batch_confirmation"
    ? "approval"
    : "context",
);
```

In `src/components/dashboard/agent-chat/use-agent-chat-messaging.ts`, replace:

```ts
setActiveInspectorTab("changes");
```

with:

```ts
setActiveInspectorTab("approval");
```

and replace:

```ts
setActiveInspectorTab("artifacts");
```

with:

```ts
setActiveInspectorTab("trace");
```

- [ ] **Step 9: Update Workbench action derivation**

In `src/components/dashboard/agent/AgentWorkbench.tsx`, keep:

```tsx
const confirmationAction = pendingAction?.type === "await_confirmation" ? pendingAction.action : null;
```

Pass `pendingAction={pendingAction}` and `action={confirmationAction}` to `AgentInspector` as it already does. No backend state shape changes are needed.

- [ ] **Step 10: Add Trace CSS**

In `src/app/styles/sunny-agent.css`, after `.sunny-agent-run-list-v2` styles, add:

```css
.sunny-agent-trace-panel-list {
  display: grid;
  gap: 0.55rem;
}
```

- [ ] **Step 11: Verify GREEN for right panel**

Run:

```bash
npm run test:e2e -- tests/e2e/dashboard-agent.spec.ts --grep "右侧以 Context"
```

Expected: PASS or SKIP only when unauthenticated.

- [ ] **Step 12: Commit**

Run:

```bash
git add src/components/dashboard/agent/types.ts src/components/dashboard/agent/constants.ts src/components/dashboard/agent/AgentApprovalPanel.tsx src/components/dashboard/agent/AgentTracePanel.tsx src/components/dashboard/agent/AgentInspector.tsx src/components/dashboard/agent/index.ts src/components/dashboard/AgentChatPanel.tsx src/components/dashboard/agent-chat/use-agent-chat-messaging.ts src/components/dashboard/agent/AgentWorkbench.tsx src/app/styles/sunny-agent.css
git commit -m "feat: productize agent inspector panels"
```

## Task 5: Composer Mode Copy and Command Feel

**Files:**
- Modify: `src/components/dashboard/agent/AgentComposer.tsx`
- Modify: `src/app/styles/sunny-agent.css`
- Test: `tests/e2e/dashboard-agent.spec.ts`

- [ ] **Step 1: Run Composer E2E test to verify RED**

Run:

```bash
npm run test:e2e -- tests/e2e/dashboard-agent.spec.ts --grep "Composer"
```

Expected: FAIL until mode labels include `只回答` and the Composer remains accessible after the Dashboard restructure.

- [ ] **Step 2: Add descriptions to mode buttons**

In `src/components/dashboard/agent/AgentComposer.tsx`, inside the mode button map, replace the button body with:

```tsx
<span>{item.label}</span>
<small>{item.description}</small>
{suggestedMode === item.key && item.key !== mode ? (
  <span className="sunny-agent-mode-hint" aria-label="建议模式">●</span>
) : null}
```

- [ ] **Step 3: Add operation state text**

In `AgentComposer`, before `return`, add:

```tsx
const operationState = pendingAction?.type === "await_confirmation"
  ? "等待确认"
  : mode === "ask"
    ? "只回答"
    : mode === "plan"
      ? "生成建议"
      : mode === "execute"
        ? "可执行"
        : mode === "review"
          ? "复盘"
          : "时间线";
```

Then replace:

```tsx
<span>{statusLabel}</span>
```

with:

```tsx
<span>{operationState} · {statusLabel}</span>
```

- [ ] **Step 4: Update mode switch CSS**

In `src/app/styles/sunny-agent.css`, after `.sunny-agent-mode-switch-v2 button` styles, add:

```css
.sunny-agent-mode-switch-v2 button {
  display: inline-grid;
  align-items: center;
  justify-items: center;
  gap: 0.08rem;
}

.sunny-agent-mode-switch-v2 button small {
  max-width: 100%;
  overflow: hidden;
  color: inherit;
  font-size: var(--text-2xs);
  font-weight: var(--font-weight-body);
  opacity: 0.68;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

- [ ] **Step 5: Verify GREEN for Composer**

Run:

```bash
npm run test:e2e -- tests/e2e/dashboard-agent.spec.ts --grep "Composer"
```

Expected: PASS or SKIP only when unauthenticated.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/components/dashboard/agent/AgentComposer.tsx src/app/styles/sunny-agent.css
git commit -m "feat: clarify agent composer modes"
```

## Task 6: Responsive Workbench Polish

**Files:**
- Modify: `src/app/styles/sunny-agent.css`
- Modify: `src/app/styles/sunny-ui.css`
- Test: `tests/e2e/dashboard-agent.spec.ts`

- [ ] **Step 1: Run mobile E2E test to verify RED**

Run:

```bash
npm run test:e2e -- tests/e2e/dashboard-agent.spec.ts --grep "移动端"
```

Expected: FAIL if the workbench grid overflows at 390px or the Composer is not visible.

- [ ] **Step 2: Update workbench desktop and mobile layout CSS**

In `src/app/styles/sunny-agent.css`, replace the first `.sunny-agent-workbench-layout` block with:

```css
.sunny-agent-workbench-layout {
  display: grid;
  grid-template-columns: var(--agent-rail-width) minmax(0, 1fr) var(--agent-inspector-width);
  gap: var(--agent-gap-lg);
  align-items: stretch;
  min-height: var(--agent-min-height);
  border: 1px solid var(--border);
  border-radius: var(--agent-radius-shell);
  box-shadow: var(--agent-shadow-shell);
  background: var(--surface);
  padding: var(--agent-gap-lg);
  overflow: hidden;
}
```

In the `@media (max-width: 820px)` block, replace the existing workbench/sidebar rules with:

```css
@media (max-width: 820px) {
  .sunny-agent-workbench-layout,
  .sunny-agent-workbench-layout.sunny-agent-sidebar-collapsed,
  .sunny-agent-workbench-layout.sunny-agent-layout-focus,
  .sunny-agent-workbench-layout.sunny-agent-layout-inspector {
    grid-template-columns: minmax(0, 1fr) !important;
    min-height: auto;
    padding: 0.5rem;
    overflow-y: auto;
  }

  .sunny-agent-left-rail-column {
    max-height: none;
  }

  .sunny-agent-left-rail-column.is-collapsed {
    order: -1;
  }

  .sunny-agent-left-rail {
    max-height: 16rem;
  }

  .sunny-agent-sidebar-collapsed .sunny-agent-center-surface {
    min-width: 0;
  }

  .sunny-agent-rail-footer {
    display: none;
  }

  .sunny-agent-composer {
    position: sticky;
    bottom: 0;
    z-index: 2;
  }

  .sunny-agent-composer-top,
  .sunny-agent-composer-row,
  .sunny-agent-approval-banner-main,
  .sunny-agent-run-surface-head,
  .sunny-agent-inspector-head,
  .sunny-agent-dock-v2-head {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  .sunny-agent-composer-top .sunny-agent-mode-switch-v2,
  .sunny-agent-composer-top > span:last-child {
    margin-left: 0;
    max-width: 100%;
  }

  .sunny-agent-run-button {
    width: 100%;
  }

  .sunny-agent-message-row {
    max-width: 100%;
  }
}
```

- [ ] **Step 3: Ensure host shell cannot overflow horizontally**

In `src/app/styles/sunny-ui.css`, add:

```css
.sunny-dashboard-agent-shell,
.sunny-dashboard-agent-host {
  max-width: 100vw;
}
```

- [ ] **Step 4: Verify GREEN for mobile**

Run:

```bash
npm run test:e2e -- tests/e2e/dashboard-agent.spec.ts --grep "移动端"
```

Expected: PASS or SKIP only when unauthenticated.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/app/styles/sunny-agent.css src/app/styles/sunny-ui.css
git commit -m "fix: polish responsive agent workbench"
```

## Task 7: Admin Copy Alignment Without Schema Changes

**Files:**
- Create: `tests/agent/admin-copy.test.ts`
- Modify: `src/lib/site-copy.ts`

- [ ] **Step 1: Write failing copy test**

Create `tests/agent/admin-copy.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { getSiteCopy } from "../../src/lib/site-copy";

test("Chinese admin groups match Dashboard-first product language", () => {
  const groups = getSiteCopy("zh").admin.groups;

  assert.equal(groups.content, "内容管理");
  assert.equal(groups.planning, "计划与日程");
  assert.equal(groups.agent, "AI Agent");
  assert.equal(groups.settings, "设置");
  assert.equal(groups.system, "系统");
});
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
npm run test:agent -- tests/agent/admin-copy.test.ts
```

Expected: FAIL because current labels are `内容`, `计划`, and `Agent`.

- [ ] **Step 3: Update Chinese Admin labels**

In `src/lib/site-copy.ts`, under `zh.admin.groups`, replace:

```ts
content: "内容",
planning: "计划",
agent: "Agent",
```

with:

```ts
content: "内容管理",
planning: "计划与日程",
agent: "AI Agent",
```

- [ ] **Step 4: Run test to verify GREEN**

Run:

```bash
npm run test:agent -- tests/agent/admin-copy.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add tests/agent/admin-copy.test.ts src/lib/site-copy.ts
git commit -m "feat: align admin group copy"
```

## Task 8: Final Verification and Browser QA

**Files:**
- No code files unless verification exposes a defect.

- [ ] **Step 1: Run Agent tests**

Run:

```bash
npm run test:agent
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run Dashboard E2E**

Run:

```bash
npm run test:e2e -- tests/e2e/dashboard-agent.spec.ts
```

Expected: PASS in an authenticated local test session, or SKIP only for tests guarded by missing `agent-workbench`.

- [ ] **Step 4: Start the dev server**

Run:

```bash
npm run dev
```

Expected: Next.js dev server starts and prints a localhost URL.

- [ ] **Step 5: Verify desktop in Browser**

Open `http://localhost:3000/dashboard` in the in-app browser.

Expected visible state:

- A single Agent workspace body under the top bar.
- Left sidebar includes 工作台, Agent Threads, 待确认, Pinned.
- Center area includes conversation and Composer.
- Right panel tabs read Context, Approval, Trace.

- [ ] **Step 6: Verify mobile in Browser**

Set the browser viewport to `390x844` and reload `http://localhost:3000/dashboard`.

Expected visible state:

- No horizontal overflow.
- Composer remains visible.
- Sidebar and right panel do not overlap the conversation incoherently.

- [ ] **Step 7: Commit final fixes if verification required changes**

If Step 1-6 exposed a defect and you edited code, run:

```bash
git add tests/e2e/dashboard-agent.spec.ts tests/agent/admin-copy.test.ts 'src/app/(site)/dashboard/page.tsx' src/components/dashboard/sections/DashboardAgentChatFullSection.tsx src/components/dashboard/agent src/components/dashboard/AgentChatPanel.tsx src/components/dashboard/agent-chat/use-agent-chat-messaging.ts src/app/styles/sunny-agent.css src/app/styles/sunny-ui.css src/lib/site-copy.ts
git commit -m "fix: stabilize dashboard agent workspace"
```

Expected: commit succeeds only if there are additional verification fixes.

## Self-Review

- Spec coverage: Tasks 1-2 cover default Dashboard host and old module removal. Task 3 covers left navigation, threads, pending, pinned, and sidebar bug surface. Task 4 covers Context / Approval / Trace. Task 5 covers command-like Composer copy. Task 6 covers responsive behavior. Task 7 covers Admin product language without schema changes. Task 8 covers verification.
- Payload boundary: This plan does not change Payload collection schemas or database structure. It keeps the first stage UI-focused and leaves later `AgentThread`, `AgentRun`, `ScheduleItem`, and `AgentMemory` schema restructuring available.
- Type consistency: `AgentInspectorTab` uses `context | approval | trace` across `types.ts`, `constants.ts`, `AgentInspector.tsx`, `AgentChatPanel.tsx`, and `use-agent-chat-messaging.ts`.
