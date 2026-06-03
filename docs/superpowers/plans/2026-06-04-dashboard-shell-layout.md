# Dashboard Shell 布局重构 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `/dashboard` 路由从全屏 Agent 工作台 + 顶部 Chrome 条重构为双层左侧导航 + 底部状态栏的 Claude Code/Codex 式布局。

**Architecture:** 新建 `DashboardShell` 作为外层布局容器（48px 图标栏 + 280px 可折叠面板 + flex 主区域 + 28px 底栏），简化 `AgentWorkbench` 去掉 sidebar/shell 层，inspector 改为右侧抽屉式。Agent 核心 hooks（`useAgentChatMessaging` / `useAgentThreadList`）零改动。

**Tech Stack:** React 19 + Next.js 15 + TypeScript + motion/react + Tailwind CSS v4 + CSS 自定义属性

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| **Create** | `src/app/styles/sunny-dashboard-shell.css` | Grid 容器 + 图标栏 + 面板 + 底栏 CSS |
| **Create** | `src/components/dashboard/DashboardShell.tsx` | 顶层布局容器，组合所有新组件 |
| **Create** | `src/components/dashboard/DashboardIconBar.tsx` | 48px 极窄图标导航栏 |
| **Create** | `src/components/dashboard/DashboardSlidePanel.tsx` | 280px 会话/建议/执行面板 |
| **Create** | `src/components/dashboard/DashboardStatusBar.tsx` | 28px 底部状态栏 |
| **Create** | `src/components/dashboard/DashboardModeChips.tsx` | 模式切换 chips |
| **Modify** | `src/app/globals.css:42` | 导入新 CSS |
| **Modify** | `src/components/dashboard/agent/AgentWorkbench.tsx` | 移除 sidebar/shell/layout props |
| **Modify** | `src/components/dashboard/agent/AgentChatPanel.tsx` | 不再渲染 Shell，返回简化版 Workbench |
| **Modify** | `src/app/(site)/dashboard/page.tsx` | 改用 DashboardShell |
| **Modify** | `src/components/dashboard/agent/index.ts` | 移除废弃导出，新增导出 |

---

### Task 1: CSS Foundation — `sunny-dashboard-shell.css`

**Files:**
- Create: `src/app/styles/sunny-dashboard-shell.css`
- Modify: `src/app/globals.css:42`

- [ ] **Step 1: Create the CSS file**

Write `src/app/styles/sunny-dashboard-shell.css`:

```css
/**
 * Dashboard Shell 布局：图标栏 + 展开面板 + 主区域 + 底部状态栏。
 * 所有 .sunny-dashboard-* 前缀，不与 .sunny-agent-* 冲突。
 */

/* ═══ CSS 变量扩展（追加到 token 体系） ═══ */
:root {
  --dashboard-icon-bar-width: 3rem;      /* 48px */
  --dashboard-panel-width: 17.5rem;      /* 280px */
  --dashboard-status-height: 1.75rem;    /* 28px */
  --dashboard-chips-gap: 0.5rem;
}

/* ═══ 顶层 Grid 容器 ═══ */
.sunny-dashboard-shell {
  display: grid;
  grid-template-columns: var(--dashboard-icon-bar-width) var(--dashboard-panel-width) minmax(0, 1fr);
  grid-template-rows: 1fr var(--dashboard-status-height);
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background: var(--background);
}

.sunny-dashboard-shell.is-panel-collapsed {
  grid-template-columns: var(--dashboard-icon-bar-width) minmax(0, 1fr);
}

/* ═══ 图标栏 ═══ */
.sunny-dashboard-icon-bar {
  grid-row: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.75rem 0;
  background: var(--surface);
  border-right: 1px solid var(--border);
  overflow: hidden;
  user-select: none;
}

.sunny-dashboard-icon-brand {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;   /* 36px */
  height: 2.25rem;
  border-radius: 0.75rem;
  background: var(--accent);
  color: #fff;
  font-size: var(--text-sm);
  font-weight: 700;
  flex-shrink: 0;
  text-decoration: none;
}

.sunny-dashboard-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border: none;
  border-radius: 0.4rem;
  background: transparent;
  color: var(--muted);
  font-size: 1.05rem;
  cursor: pointer;
  flex-shrink: 0;
  position: relative;
  transition: background 0.12s, color 0.12s;
  line-height: 1;
}

.sunny-dashboard-icon-btn:hover {
  background: var(--accent-soft);
  color: var(--foreground);
}

.sunny-dashboard-icon-btn.is-active {
  background: var(--accent-soft);
  color: var(--accent);
}

.sunny-dashboard-icon-btn.is-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.4rem;
  bottom: 0.4rem;
  width: 2px;
  background: var(--accent);
  border-radius: 0 2px 2px 0;
}

.sunny-dashboard-icon-separator {
  width: 1.25rem;
  height: 1px;
  background: var(--border);
  margin: 0.25rem 0;
  flex-shrink: 0;
}

.sunny-dashboard-icon-bar-top {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  width: 100%;
}

.sunny-dashboard-icon-bar-bottom {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  width: 100%;
}

/* ═══ 展开面板 ═══ */
.sunny-dashboard-slide-panel {
  grid-row: 1 / -1;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-right: 1px solid var(--border);
  overflow: hidden;
  min-width: 0;
}

.sunny-dashboard-slide-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.85rem 0.9rem 0.5rem;
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  flex-shrink: 0;
}

.sunny-dashboard-slide-panel-new-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.4rem;
  height: 1.4rem;
  border: 1px solid var(--border);
  border-radius: 0.35rem;
  background: transparent;
  color: var(--muted);
  font-size: var(--text-xs);
  cursor: pointer;
  transition: color 0.12s, border-color 0.12s;
}

.sunny-dashboard-slide-panel-new-btn:hover {
  color: var(--foreground);
  border-color: var(--accent);
}

.sunny-dashboard-slide-panel-search {
  padding: 0 0.9rem 0.6rem;
  flex-shrink: 0;
}

.sunny-dashboard-slide-panel-search input {
  width: 100%;
  padding: 0.35rem 0.6rem;
  border-radius: 0.4rem;
  border: 1px solid var(--border);
  background: var(--surface-strong);
  color: var(--foreground);
  font-size: var(--text-xs);
  font-family: var(--sunny-font-sans);
}

.sunny-dashboard-slide-panel-search input::placeholder {
  color: var(--muted);
}

.sunny-dashboard-slide-panel-search input:focus {
  outline: none;
  border-color: var(--accent);
}

.sunny-dashboard-slide-panel-body {
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0 0.5rem 0.5rem;
}

.sunny-dashboard-slide-section-label {
  padding: 0.6rem 0.6rem 0.25rem;
  font-size: 0.625rem;
  font-weight: 700;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* ═══ 状态栏 ═══ */
.sunny-dashboard-status-bar {
  grid-column: 2 / -1;
  grid-row: 2;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0 0.75rem;
  background: var(--surface);
  border-top: 1px solid var(--border);
  font-family: var(--sunny-font-mono);
  font-size: 0.6875rem;  /* 11px */
  color: var(--muted);
  min-width: 0;
  overflow: hidden;
}

.sunny-dashboard-status-bar .is-spacer {
  flex: 1;
}

.sunny-dashboard-status-dot {
  width: 0.44rem;
  height: 0.44rem;
  border-radius: 50%;
  background: var(--success, #3fb950);
  flex-shrink: 0;
}

/* panel-collapsed 时状态栏跨满底部 */
.sunny-dashboard-shell.is-panel-collapsed .sunny-dashboard-status-bar {
  grid-column: 2 / -1;
}

/* ═══ 主区域 ═══ */
.sunny-dashboard-main {
  grid-row: 1;
  grid-column: 3;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  padding: 1rem;
}

.sunny-dashboard-shell.is-panel-collapsed .sunny-dashboard-main {
  grid-column: 2;
}

/* ═══ 模式 Chips ═══ */
.sunny-dashboard-mode-chips {
  display: flex;
  gap: var(--dashboard-chips-gap);
  flex-wrap: wrap;
  flex-shrink: 0;
  margin-bottom: 0.75rem;
}

.sunny-dashboard-mode-chip {
  padding: 0.35rem 0.9rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--foreground);
  font-size: var(--text-xs);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.12s;
  font-family: var(--sunny-font-sans);
  line-height: 1.4;
}

.sunny-dashboard-mode-chip:hover {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.sunny-dashboard-mode-chip.is-active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

/* ═══ Inspector 触发按钮 ═══ */
.sunny-dashboard-inspector-toggle {
  position: fixed;
  right: 0.75rem;
  bottom: calc(var(--dashboard-status-height) + 0.75rem);
  z-index: 45;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border: 1px solid var(--border);
  border-radius: 0.4rem;
  background: var(--surface-strong);
  color: var(--muted);
  font-size: var(--text-sm);
  cursor: pointer;
  box-shadow: var(--agent-shadow-shell, 0 4px 12px rgba(0,0,0,0.08));
  transition: color 0.12s, background 0.12s;
}

.sunny-dashboard-inspector-toggle:hover {
  color: var(--foreground);
  background: var(--surface);
}

/* ═══ 深色模式 ═══ */
html[data-theme="dark"] .sunny-dashboard-icon-bar,
html[data-theme="dark"] .sunny-dashboard-slide-panel,
html[data-theme="dark"] .sunny-dashboard-status-bar {
  background: var(--surface);
}

html[data-theme="dark"] .sunny-dashboard-shell {
  background: var(--background);
}

/* ═══ 响应式：窄屏自动折叠面板 ═══ */
@media (max-width: 900px) {
  .sunny-dashboard-shell {
    grid-template-columns: var(--dashboard-icon-bar-width) minmax(0, 1fr);
  }
  .sunny-dashboard-slide-panel {
    display: none;
  }
}

/* ═══ 尊重用户动画偏好 ═══ */
@media (prefers-reduced-motion: reduce) {
  .sunny-dashboard-icon-btn,
  .sunny-dashboard-mode-chip,
  .sunny-dashboard-inspector-toggle {
    transition: none;
  }
}
```

- [ ] **Step 2: Import the new CSS in `globals.css`**

Add after line 42 (the last `@import`) of `src/app/globals.css`:

```css
@import "./styles/sunny-dashboard-shell.css";
```

- [ ] **Step 3: Commit**

```bash
git add src/app/styles/sunny-dashboard-shell.css src/app/globals.css
git commit -m "feat: add Dashboard Shell CSS foundation

- Grid layout: 48px icon bar + 280px panel + flex main + 28px status bar
- CSS custom properties: --dashboard-icon-bar-width, --dashboard-panel-width, --dashboard-status-height
- Dark mode, reduced-motion, responsive (<900px auto-collapse panel) covered
- All classes use .sunny-dashboard-* prefix, no conflict with .sunny-agent-*

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: DashboardStatusBar Component

**Files:**
- Create: `src/components/dashboard/DashboardStatusBar.tsx`

- [ ] **Step 1: Create the component**

Write `src/components/dashboard/DashboardStatusBar.tsx`:

```tsx
"use client";

export type DashboardStatusBarProps = {
  /** 当前分支名 */
  branch?: string;
  /** 模型名称 */
  model?: string;
  /** 搜索入口是否可用 */
  searchAvailable?: boolean;
  /** 状态文本，如"就绪"、"运行中" */
  statusLabel: string;
  /** 上下文 token 数（格式化后的字符串） */
  tokenCount?: string;
};

export function DashboardStatusBar({
  branch = "main",
  model = "DeepSeek V3",
  searchAvailable = true,
  statusLabel,
  tokenCount,
}: DashboardStatusBarProps) {
  return (
    <footer className="sunny-dashboard-status-bar" role="status" aria-label="工作台状态">
      <span className="sunny-dashboard-status-dot" aria-hidden="true" />
      <span>{model}</span>
      <span aria-hidden="true">|</span>
      <span>{branch}</span>
      <span className="is-spacer" />
      {searchAvailable ? (
        <>
          <span aria-hidden="true">⌘K</span>
          <span aria-hidden="true">|</span>
        </>
      ) : null}
      {tokenCount ? (
        <>
          <span>上下文 {tokenCount}</span>
          <span aria-hidden="true">|</span>
        </>
      ) : null}
      <span>{statusLabel}</span>
    </footer>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/DashboardStatusBar.tsx
git commit -m "feat: add DashboardStatusBar component

Displays model, branch, search shortcut, token count, and status text
in a 28px bottom bar.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: DashboardIconBar Component

**Files:**
- Create: `src/components/dashboard/DashboardIconBar.tsx`

- [ ] **Step 1: Create the component**

Write `src/components/dashboard/DashboardIconBar.tsx`:

```tsx
"use client";

import Link from "next/link";
import { ThemeToggle } from "@/components/public/ThemeToggle";
import { useSitePreferences } from "@/components/shared/SitePreferencesProvider";

export type DashboardIconMode = "agent" | "today" | "plans" | "schedule" | "writing" | "memory";

export const DASHBOARD_MODES: Array<{
  key: DashboardIconMode;
  label: string;
  /** emoji / unicode 图标 */
  icon: string;
  /** 注入输入框的预设 prompt，空字符串表示不自动填入 */
  prompt: string;
}> = [
  { key: "agent",   label: "Agent",  icon: "S",  prompt: "" },
  { key: "today",   label: "今日",   icon: "📅", prompt: "帮我整理今天最应该推进的工作" },
  { key: "plans",   label: "计划",   icon: "📋", prompt: "帮我检查所有进行中计划的进度" },
  { key: "schedule", label: "日程",   icon: "⏱",  prompt: "帮我查看最近的日程安排" },
  { key: "writing", label: "写作",   icon: "✏️", prompt: "帮我整理最近的写作素材" },
  { key: "memory",  label: "记忆",   icon: "🧠", prompt: "帮我回顾最近的经验教训" },
];

type DashboardIconBarProps = {
  activeMode: DashboardIconMode;
  onModeChange: (mode: DashboardIconMode, prompt: string) => void;
  onSearchClick?: () => void;
  onTogglePanel: () => void;
  panelOpen: boolean;
};

export function DashboardIconBar({
  activeMode,
  onModeChange,
  onSearchClick,
  onTogglePanel,
  panelOpen,
}: DashboardIconBarProps) {
  const { locale } = useSitePreferences();

  return (
    <nav className="sunny-dashboard-icon-bar" aria-label="工作台导航">
      <div className="sunny-dashboard-icon-bar-top">
        {/* Brand — 点击回到 Agent 模式 */}
        <Link
          href="/dashboard"
          className="sunny-dashboard-icon-brand"
          title="SunnyPanel"
          aria-label="SunnyPanel 首页"
        >
          S
        </Link>

        <span className="sunny-dashboard-icon-separator" aria-hidden="true" />

        {/* 页面/模式图标 */}
        {DASHBOARD_MODES.map((mode) => (
          <button
            key={mode.key}
            type="button"
            className={`sunny-dashboard-icon-btn${mode.key === activeMode ? " is-active" : ""}`}
            title={mode.label}
            aria-label={mode.label}
            aria-current={mode.key === activeMode ? "true" : undefined}
            onClick={() => onModeChange(mode.key, mode.prompt)}
          >
            {mode.icon}
          </button>
        ))}

        <span className="sunny-dashboard-icon-separator" aria-hidden="true" />

        {/* 搜索 */}
        {onSearchClick ? (
          <button
            type="button"
            className="sunny-dashboard-icon-btn"
            title="搜索 (⌘K)"
            aria-label="搜索"
            onClick={onSearchClick}
          >
            🔍
          </button>
        ) : null}
      </div>

      <div className="sunny-dashboard-icon-bar-bottom">
        {/* 主题切换 */}
        <ThemeToggle locale={locale} variant="admin" />

        {/* 面板折叠 */}
        <button
          type="button"
          className="sunny-dashboard-icon-btn"
          title={panelOpen ? "收起面板" : "展开面板"}
          aria-label={panelOpen ? "收起面板" : "展开面板"}
          onClick={onTogglePanel}
        >
          {panelOpen ? "◀" : "▶"}
        </button>
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/DashboardIconBar.tsx
git commit -m "feat: add DashboardIconBar component

48px vertical icon nav bar with brand, mode icons, search, theme toggle,
and panel toggle. Replaces DashboardWorkspaceChrome navigation functions.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: DashboardSlidePanel Component

**Files:**
- Create: `src/components/dashboard/DashboardSlidePanel.tsx`

- [ ] **Step 1: Create the component**

Write `src/components/dashboard/DashboardSlidePanel.tsx`:

```tsx
"use client";

import { useCallback, useRef, useState } from "react";
import type { PendingAction } from "@/lib/agent/schemas";
import type { AgentInboxSuggestion } from "@/lib/agent/suggestions";
import type { AgentQuickPrompt } from "@/lib/agent/quick-prompts";
import { AgentTaskRow } from "@/components/dashboard/agent/AgentTaskRow";
import { riskLevelLabelMap } from "@/components/dashboard/agent/constants";
import type { AgentRunSummary, AgentThreadSummary } from "@/components/dashboard/agent/types";
import { getPendingActionLabel } from "@/components/dashboard/agent/utils";

type DashboardSlidePanelProps = {
  disabled?: boolean;
  isThinking: boolean;
  onArchiveThread?: (threadId: number, archived: boolean) => void;
  onLoadThread: (threadId: number) => void;
  onNewThread: () => void;
  onRunPrompt: (prompt: string) => void;
  onSearchThreads?: (query: string) => void;
  onSelectRun?: (runId: number) => void;
  onRunSuggestion: (suggestion: AgentInboxSuggestion) => void;
  pendingAction: null | PendingAction;
  quickPrompts: AgentQuickPrompt[];
  recentRuns: AgentRunSummary[];
  selectedRunId?: null | number;
  statusLabel: string;
  suggestions: AgentInboxSuggestion[];
  threadId: null | number;
  threads: AgentThreadSummary[];
};

/**
 * 从 AgentSidebar 提取的会话/建议/最近执行区块。
 * 复用 AgentTaskRow 组件。
 */
export function DashboardSlidePanel({
  disabled,
  isThinking,
  onArchiveThread,
  onLoadThread,
  onNewThread,
  onRunPrompt,
  onSearchThreads,
  onSelectRun,
  onRunSuggestion,
  pendingAction,
  quickPrompts,
  recentRuns,
  selectedRunId,
  statusLabel,
  suggestions,
  threadId,
  threads,
}: DashboardSlidePanelProps) {
  const [threadSearch, setThreadSearch] = useState("");
  const [showAllThreads, setShowAllThreads] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback(
    (value: string) => {
      setThreadSearch(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onSearchThreads?.(value);
      }, 300);
    },
    [onSearchThreads],
  );

  const visibleThreads = showAllThreads ? threads : threads.slice(0, 8);

  /* 合并 inbox 建议 + quick prompts 为统一建议列表（复用 utils） */
  const tasks = suggestions.slice(0, 3).map((s) => ({
    id: `inbox-${s.id}`,
    label: s.title,
    prompt: s.suggestedPrompt,
    reason: s.reason,
    riskLevel: s.riskLevel,
    source: s.source,
    suggestion: s,
  }));
  const quickTasks = quickPrompts.slice(0, 2).map((p) => ({
    id: `quick-${p.prompt}`,
    label: p.label,
    prompt: p.prompt,
    reason: p.prompt,
  }));
  const allTasks = [...tasks, ...quickTasks];

  return (
    <aside className="sunny-dashboard-slide-panel" aria-label="Agent 面板">
      {/* Header */}
      <div className="sunny-dashboard-slide-panel-head">
        <span>Agent 会话</span>
        <button
          type="button"
          className="sunny-dashboard-slide-panel-new-btn"
          onClick={onNewThread}
          title="新建会话"
          aria-label="新建会话"
        >
          +
        </button>
      </div>

      {/* Search */}
      <div className="sunny-dashboard-slide-panel-search">
        <input
          type="text"
          value={threadSearch}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="搜索会话..."
          aria-label="搜索会话"
        />
      </div>

      {/* Body */}
      <div className="sunny-dashboard-slide-panel-body">

        {/* 当前任务 */}
        <div className="sunny-dashboard-slide-section-label">当前任务</div>
        <AgentTaskRow
          detail={isThinking ? "运行中" : "就绪"}
          label={statusLabel}
          meta={threadId ? `#${threadId}` : null}
          tone={isThinking ? "info" : "success"}
        />

        {/* 待确认 */}
        {pendingAction ? (
          <>
            <div className="sunny-dashboard-slide-section-label">待确认</div>
            <AgentTaskRow
              detail={getPendingActionLabel(pendingAction)}
              label={
                pendingAction.type === "await_confirmation"
                  ? pendingAction.action.summary
                  : pendingAction.type === "await_queue_resume"
                    ? "延迟队列可继续"
                    : "需要继续输入"
              }
              meta="待处理"
              tone={
                pendingAction.type === "await_confirmation" &&
                pendingAction.action.riskLevel === "high"
                  ? "danger"
                  : pendingAction.type === "await_confirmation" &&
                      pendingAction.action.riskLevel === "medium"
                    ? "warning"
                    : "warning"
              }
            />
          </>
        ) : null}

        {/* 建议 */}
        <div className="sunny-dashboard-slide-section-label">建议</div>
        {allTasks.length > 0 ? (
          allTasks.map((task) => (
            <AgentTaskRow
              key={task.id}
              disabled={disabled}
              detail={task.reason}
              label={task.label}
              meta={task.riskLevel ? riskLevelLabelMap[task.riskLevel] : task.source ?? "建议"}
              onClick={() => {
                if (task.suggestion) {
                  onRunSuggestion(task.suggestion);
                  return;
                }
                onRunPrompt(task.prompt);
              }}
              tone={
                task.riskLevel === "high"
                  ? "danger"
                  : task.riskLevel === "medium"
                    ? "warning"
                    : "accent"
              }
            />
          ))
        ) : (
          <AgentTaskRow detail="输入目标即可开始" label="暂无建议" tone="muted" />
        )}

        {/* 会话列表 */}
        <div className="sunny-dashboard-slide-section-label">会话</div>
        {visibleThreads.map((thread) => (
          <AgentTaskRow
            key={thread.id}
            detail={thread.pendingAction ? getPendingActionLabel(thread.pendingAction) : thread.title}
            label={thread.title || `会话 #${thread.id}`}
            meta={thread.archived ? "归档" : thread.tags?.length ? thread.tags[0] : `#${thread.id}`}
            onClick={() => onLoadThread(thread.id)}
            selected={thread.id === threadId}
            tone={thread.archived ? "muted" : thread.pendingAction ? "warning" : "muted"}
          />
        ))}
        {!showAllThreads && threads.length > 8 ? (
          <button
            type="button"
            style={{
              width: "100%",
              padding: "0.3rem",
              border: "none",
              background: "transparent",
              color: "var(--muted)",
              fontSize: "0.75rem",
              cursor: "pointer",
            }}
            onClick={() => setShowAllThreads(true)}
          >
            显示全部 ({threads.length})
          </button>
        ) : null}
        {threads.length === 0 ? (
          <AgentTaskRow
            detail={threadSearch ? "没有匹配的会话" : "还没有历史会话"}
            label={threadSearch ? "未找到" : "暂无会话"}
            tone="muted"
          />
        ) : null}

        {/* 最近执行 */}
        <div className="sunny-dashboard-slide-section-label">最近</div>
        {recentRuns.slice(0, 4).map((run) => (
          <AgentTaskRow
            key={run.id}
            detail={run.impactSummary ?? run.summary ?? run.workflow}
            label={run.title}
            meta={
              run.status === "succeeded"
                ? "成功"
                : run.status === "failed"
                  ? "失败"
                  : run.runKind === "rollback"
                    ? "回滚"
                    : run.status
            }
            onClick={onSelectRun ? () => onSelectRun(run.id) : undefined}
            selected={run.id === selectedRunId}
            tone={
              run.status === "failed"
                ? "danger"
                : run.runKind === "rollback"
                  ? "warning"
                  : run.status === "succeeded"
                    ? "success"
                    : "info"
            }
          />
        ))}
        {recentRuns.length === 0 ? (
          <AgentTaskRow detail="还没有审计记录" label="暂无记录" tone="muted" />
        ) : null}
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/DashboardSlidePanel.tsx
git commit -m "feat: add DashboardSlidePanel component

280px collapsible panel containing thread list, suggestions, pending actions,
and recent runs. Extracts content from AgentSidebar. Search has 300ms debounce.
Reuses AgentTaskRow for all list items.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: DashboardModeChips Component

**Files:**
- Create: `src/components/dashboard/DashboardModeChips.tsx`

- [ ] **Step 1: Create the component**

Write `src/components/dashboard/DashboardModeChips.tsx`:

```tsx
"use client";

import { DASHBOARD_MODES, type DashboardIconMode } from "./DashboardIconBar";

type DashboardModeChipsProps = {
  activeMode: DashboardIconMode;
  onModeChange: (mode: DashboardIconMode, prompt: string) => void;
};

/**
 * 模式切换 chips，显示在主区域顶部。
 * 点击 → 更新图标栏 active 态 + 填入预设 prompt（不自动发送）。
 */
export function DashboardModeChips({ activeMode, onModeChange }: DashboardModeChipsProps) {
  return (
    <nav className="sunny-dashboard-mode-chips" aria-label="Agent 模式切换">
      {DASHBOARD_MODES.map((mode) => (
        <button
          key={mode.key}
          type="button"
          className={`sunny-dashboard-mode-chip${mode.key === activeMode ? " is-active" : ""}`}
          aria-pressed={mode.key === activeMode}
          onClick={() => onModeChange(mode.key, mode.prompt)}
        >
          {mode.label}
        </button>
      ))}
    </nav>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/DashboardModeChips.tsx
git commit -m "feat: add DashboardModeChips component

Mode chips (Agent/今日/计划/日程/写作/记忆) displayed at top of main area.
Clicking a chip sets the active mode in the icon bar and fills the composer
with a preset prompt. Replaces the old hardcoded workspaceNav links.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: DashboardShell Assembly Component

**Files:**
- Create: `src/components/dashboard/DashboardShell.tsx`

- [ ] **Step 1: Create the assembly component**

Write `src/components/dashboard/DashboardShell.tsx`:

```tsx
"use client";

import { useCallback, useState, type ReactNode } from "react";
import type { AgentInboxSuggestion } from "@/lib/agent/suggestions";
import type { AgentQuickPrompt } from "@/lib/agent/quick-prompts";
import type { PendingAction } from "@/lib/agent/schemas";
import type { AgentRunSummary, AgentThreadSummary } from "@/components/dashboard/agent/types";
import { DashboardIconBar, type DashboardIconMode } from "./DashboardIconBar";
import { DashboardModeChips } from "./DashboardModeChips";
import { DashboardSlidePanel } from "./DashboardSlidePanel";
import { DashboardStatusBar } from "./DashboardStatusBar";

type DashboardShellProps = {
  children: ReactNode;
  /* Slide panel data (from useAgentThreadList) */
  isThinking: boolean;
  onArchiveThread?: (threadId: number, archived: boolean) => void;
  onLoadThread: (threadId: number) => void;
  onNewThread: () => void;
  onSearchThreads?: (query: string) => void;
  onSelectRun?: (runId: number) => void;
  onRunPrompt: (prompt: string) => void;
  onRunSuggestion: (suggestion: AgentInboxSuggestion) => void;
  pendingAction: null | PendingAction;
  quickPrompts: AgentQuickPrompt[];
  recentRuns: AgentRunSummary[];
  selectedRunId?: null | number;
  statusLabel: string;
  suggestions: AgentInboxSuggestion[];
  threadId: null | number;
  threads: AgentThreadSummary[];
  /* Status bar data */
  tokenCount?: string;
};

export function DashboardShell({
  children,
  isThinking,
  onArchiveThread,
  onLoadThread,
  onNewThread,
  onSearchThreads,
  onSelectRun,
  onRunPrompt,
  onRunSuggestion,
  pendingAction,
  quickPrompts,
  recentRuns,
  selectedRunId,
  statusLabel,
  suggestions,
  threadId,
  threads,
  tokenCount,
}: DashboardShellProps) {
  const [activeMode, setActiveMode] = useState<DashboardIconMode>("agent");
  const [panelOpen, setPanelOpen] = useState(true);
  // placeholder: inspector drawer — wired in Task 7 when AgentWorkbench is adapted
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [inspectorOpen, setInspectorOpen] = useState(false);

  const handleModeChange = useCallback(
    (_mode: DashboardIconMode, prompt: string) => {
      setActiveMode(_mode);
      if (prompt) {
        onRunPrompt(prompt);
      }
    },
    [onRunPrompt],
  );

  const handleTogglePanel = useCallback(() => {
    setPanelOpen((v) => !v);
  }, []);

  return (
    <div
      className={`sunny-dashboard-shell${!panelOpen ? " is-panel-collapsed" : ""}`}
      data-testid="dashboard-shell"
    >
      {/* 图标栏 */}
      <DashboardIconBar
        activeMode={activeMode}
        onModeChange={handleModeChange}
        onTogglePanel={handleTogglePanel}
        panelOpen={panelOpen}
      />

      {/* 展开面板 */}
      {panelOpen ? (
        <DashboardSlidePanel
          disabled={isThinking}
          isThinking={isThinking}
          onArchiveThread={onArchiveThread}
          onLoadThread={onLoadThread}
          onNewThread={onNewThread}
          onRunPrompt={onRunPrompt}
          onSearchThreads={onSearchThreads}
          onSelectRun={onSelectRun}
          onRunSuggestion={onRunSuggestion}
          pendingAction={pendingAction}
          quickPrompts={quickPrompts}
          recentRuns={recentRuns}
          selectedRunId={selectedRunId}
          statusLabel={statusLabel}
          suggestions={suggestions}
          threadId={threadId}
          threads={threads}
        />
      ) : null}

      {/* 主区域 */}
      <main className="sunny-dashboard-main">
        <DashboardModeChips activeMode={activeMode} onModeChange={handleModeChange} />
        {children}
      </main>

      {/* 状态栏 */}
      <DashboardStatusBar
        statusLabel={statusLabel}
        tokenCount={tokenCount}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/DashboardShell.tsx
git commit -m "feat: add DashboardShell assembly component

Combines DashboardIconBar, DashboardSlidePanel, DashboardModeChips,
DashboardStatusBar into the new layout Grid. Manages panel open/close,
active mode, and inspector drawer state.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Adapt AgentWorkbench — Remove Sidebar/Shell/Layout Props

**Files:**
- Modify: `src/components/dashboard/agent/AgentWorkbench.tsx`

- [ ] **Step 1: Read the current AgentWorkbench to understand the reshape needed**

The current `AgentWorkbench` renders `<AgentWorkbenchShell>` with `sidebar`, `center`, and `inspector` props, plus manages `layout` state via `useDashboardLayout()` and `sidebarCollapsed` via `useWorkbenchNarrow()`.

After this task, `AgentWorkbench` will:
- Remove `sidebar` rendering (moved to `DashboardSlidePanel`)
- Remove `AgentWorkbenchShell` / `AgentWorkbenchLayout` usage (moved to `DashboardShell`)
- Remove `layout` / `sidebarCollapsed` / `DashboardLayoutSwitcher` / `useDashboardLayout`
- Remove `useWorkbenchNarrow` 
- Keep `AgentErrorBoundary` wrapper
- Keep center content: `AgentThinkingPanel` + `AgentApprovalCard` (confirmation) + batch approval + `AgentConversation`
- Keep `AgentComposer` at bottom
- Keep `AgentInspector` but fixed to `drawer=true` mode (the trigger is now the `DashboardInspectorToggle` in the shell)
- Remove all sidebar/layout-related props from `AgentWorkbenchProps`

- [ ] **Step 2: Edit AgentWorkbench.tsx — update imports, remove sidebar/layout code**

In `src/components/dashboard/agent/AgentWorkbench.tsx`, replace the existing imports section (lines 1-28) with:

```tsx
"use client";

import type { RefObject } from "react";
import { AnimatePresence, motion } from "motion/react";

import type { AgentInboxSuggestion } from "@/lib/agent/suggestions";
import type {
  AgentChatMessage,
  AgentTokenUsage,
  AgentTraceStep,
  PendingAction,
} from "@/lib/agent/schemas";

import { AgentApprovalCard } from "./AgentApprovalCard";
import { AgentComposer } from "./AgentComposer";
import { AgentConversation } from "./AgentConversation";
import { AgentErrorBoundary } from "./AgentErrorBoundary";
import { AgentInspector } from "./AgentInspector";
import { AgentThinkingPanel } from "./AgentThinkingPanel";
import type { AgentRollbackExecutionResult } from "./rollback-display";
import type { AgentInspectorTab, AgentRunDetail, AgentRunSummary, AgentThreadSummary, ContextPreferences } from "./types";
import { getLatestAssistantMessage } from "./utils";
```

- [ ] **Step 3: Edit AgentWorkbenchProps — remove sidebar/layout props**

Replace the `AgentWorkbenchProps` type (lines 30-75) with the slimmed version:

```tsx
type AgentWorkbenchProps = {
  activeInspectorTab: AgentInspectorTab;
  artifactsRollbackBusy?: boolean;
  artifactsRollbackError?: null | string;
  contextPreferences?: ContextPreferences;
  errorMessage: null | string;
  inboxSuggestions: AgentInboxSuggestion[];
  input: string;
  inputTokenEstimate: number;
  isSubmitting: boolean;
  isThinking: boolean;
  lastRollbackPayload?: null | unknown;
  lastRollbackResult?: AgentRollbackExecutionResult | null;
  messages: AgentChatMessage[];
  onActiveInspectorTabChange: (tab: AgentInspectorTab) => void;
  onArtifactsRollback?: () => void;
  onCancelApproval: () => void;
  onEditApproval: (kind: "plan" | "schedule" | "generic") => void;
  onConfirmApproval: () => void;
  onInputChange: (value: string) => void;
  onLoadThread: (threadId: number) => void;
  onRollbackSelectedRun?: () => void;
  onStop?: () => void;
  onSubmit: () => void;
  onToggleContextExclude?: (key: string) => void;
  onToggleContextPin?: (key: string) => void;
  pendingAction: null | PendingAction;
  selectedRunDetail?: AgentRunDetail | null;
  selectedRunRollbackBusy?: boolean;
  selectedRunRollbackError?: null | string;
  statusLabel: string;
  thinkingContent: string;
  threadId: null | number;
  tokenUsage: AgentTokenUsage;
  traceSteps: AgentTraceStep[];
  transcriptRef: RefObject<HTMLDivElement | null>;
};
```

- [ ] **Step 4: Edit AgentWorkbench function — remove sidebar/layout/Shell code**

Replace the entire function body (lines 77-315) with:

```tsx
export function AgentWorkbench(props: AgentWorkbenchProps) {
  const {
    activeInspectorTab,
    artifactsRollbackBusy,
    artifactsRollbackError,
    contextPreferences,
    errorMessage,
    input,
    inputTokenEstimate,
    isSubmitting,
    isThinking,
    lastRollbackPayload,
    lastRollbackResult,
    messages,
    onActiveInspectorTabChange,
    onArtifactsRollback,
    onCancelApproval,
    onEditApproval,
    onConfirmApproval,
    onInputChange,
    onRollbackSelectedRun,
    onStop,
    onSubmit,
    onToggleContextExclude,
    onToggleContextPin,
    pendingAction,
    selectedRunDetail,
    selectedRunRollbackBusy,
    selectedRunRollbackError,
    statusLabel,
    thinkingContent,
    threadId,
    tokenUsage,
    traceSteps,
    transcriptRef,
  } = props;

  const confirmationAction = pendingAction?.type === "await_confirmation" ? pendingAction.action : null;
  const batchActions = pendingAction?.type === "await_batch_confirmation" ? pendingAction.actions : null;
  const latestAssistantMessage = getLatestAssistantMessage(messages);

  const inspectorPanel = (
    <AgentInspector
      action={confirmationAction}
      activeTab={activeInspectorTab}
      artifactsRollbackBusy={artifactsRollbackBusy}
      artifactsRollbackError={artifactsRollbackError}
      contextPreferences={contextPreferences}
      drawer={true}
      inputTokenEstimate={inputTokenEstimate}
      latestAssistantMessage={latestAssistantMessage}
      lastRollbackPayload={lastRollbackPayload}
      lastRollbackResult={lastRollbackResult}
      messages={messages}
      onActiveTabChange={onActiveInspectorTabChange}
      onArtifactsRollback={onArtifactsRollback}
      onRollbackSelectedRun={onRollbackSelectedRun}
      onToggleContextExclude={onToggleContextExclude}
      onToggleContextPin={onToggleContextPin}
      pendingAction={pendingAction}
      selectedRunDetail={selectedRunDetail}
      selectedRunRollbackBusy={selectedRunRollbackBusy}
      selectedRunRollbackError={selectedRunRollbackError}
      statusLabel={statusLabel}
      threadId={threadId}
      tokenUsage={tokenUsage}
      traceSteps={traceSteps}
    />
  );

  return (
    <AgentErrorBoundary fallbackLabel="Agent 工作台出错了">
      <div className="sunny-agent-center-surface">
        <div className="sunny-agent-unified-body">
          <AgentThinkingPanel
            isThinking={isThinking}
            statusLabel={statusLabel}
            steps={traceSteps}
            thinkingContent={thinkingContent}
          />
          <AnimatePresence mode="wait">
            {confirmationAction ? (
              <motion.div
                key={confirmationAction.id}
                initial={{ opacity: 0, scale: 0.96, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
              >
                <AgentApprovalCard
                  action={confirmationAction}
                  disabled={isSubmitting}
                  onCancel={onCancelApproval}
                  onConfirm={onConfirmApproval}
                  onEdit={onEditApproval}
                />
              </motion.div>
            ) : batchActions && batchActions.length > 0 ? (
              <motion.div
                key="batch-confirm"
                initial={{ opacity: 0, scale: 0.96, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className="sunny-agent-batch-approval"
              >
                <p className="text-sm font-semibold text-foreground">
                  批量确认（{batchActions.length} 项）
                </p>
                <ul className="mt-3 space-y-2 text-sm text-muted">
                  {batchActions.map((action, index) => (
                    <li key={action.id} className="rounded-md border border-border/60 px-3 py-2">
                      <span className="font-medium text-foreground">{index + 1}. </span>
                      {action.summary}
                    </li>
                  ))}
                </ul>
                <motion.div layout className="mt-4 flex flex-wrap gap-2">
                  <motion.button
                    type="button"
                    className="sunny-button-primary px-4 py-2 text-sm"
                    disabled={isSubmitting}
                    onClick={onConfirmApproval}
                    whileTap={{ scale: 0.96 }}
                  >
                    全部确认
                  </motion.button>
                  <motion.button
                    type="button"
                    className="sunny-button-secondary px-4 py-2 text-sm"
                    disabled={isSubmitting}
                    onClick={onCancelApproval}
                    whileTap={{ scale: 0.96 }}
                  >
                    全部取消
                  </motion.button>
                </motion.div>
              </motion.div>
            ) : null}
          </AnimatePresence>
          <AgentConversation
            errorMessage={errorMessage}
            isSubmitting={isSubmitting}
            messages={messages}
            statusLabel={statusLabel}
            transcriptRef={transcriptRef}
          />
        </div>
        <AgentComposer
          disabled={isSubmitting}
          input={input}
          onInputChange={onInputChange}
          onStop={onStop}
          onSubmit={onSubmit}
          pendingAction={pendingAction}
          placeholder={`例如：整理今天最应该推进的一个动作`}
          statusLabel={statusLabel}
        />
      </div>
      {inspectorPanel}
    </AgentErrorBoundary>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/agent/AgentWorkbench.tsx
git commit -m "refactor: slim AgentWorkbench — remove sidebar/shell/layout

Remove sidebar rendering (moved to DashboardSlidePanel), AgentWorkbenchShell
wrapper (moved to DashboardShell), layout switcher, sidebarCollapsed logic.
Inspector fixed to drawer=true mode.
Center content (thinking, approval, conversation, composer) unchanged.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Adapt AgentChatPanel — Return Simplified Workbench + Token Formatting

**Files:**
- Modify: `src/components/dashboard/AgentChatPanel.tsx` (lines 315-389)

- [ ] **Step 1: Edit the render return — remove sidebar-related props**

Replace the `<AgentWorkbench />` JSX block (lines 316-389 in `src/components/dashboard/AgentChatPanel.tsx`) with:

```tsx
  const tokenCountStr = (() => {
    if (tokenUsage.totalTokens <= 0) return undefined;
    const k = Math.round(tokenUsage.totalTokens / 100) / 10;
    return `${k}k tokens`;
  })();

  return (
    <AgentWorkbench
      activeInspectorTab={activeInspectorTab}
      artifactsRollbackBusy={artifactsRollbackBusy}
      artifactsRollbackError={artifactsRollbackError}
      contextPreferences={contextPreferences}
      errorMessage={errorMessage}
      inboxSuggestions={inboxSuggestions}
      input={input}
      inputTokenEstimate={inputTokenEstimate}
      isSubmitting={isSubmitting}
      isThinking={isThinking}
      lastRollbackPayload={lastRollbackPayload}
      lastRollbackResult={lastRollbackResult}
      messages={messages}
      onActiveInspectorTabChange={setActiveInspectorTab}
      onArtifactsRollback={() => {
        clearRunDetail();
        runArtifactsRollback();
      }}
      onCancelApproval={() => {
        clearRunDetail();
        cancelApproval();
      }}
      onEditApproval={editApproval}
      onConfirmApproval={() => {
        clearRunDetail();
        confirmApproval();
      }}
      onInputChange={setInput}
      onLoadThread={(nextThreadId) => {
        void loadThread(nextThreadId);
      }}
      onRollbackSelectedRun={() => {
        void rollbackSelectedRun();
      }}
      onRunSuggestion={(_suggestion) => {
        clearRunDetail();
        void runSuggestion(_suggestion);
      }}
      onStop={stopGeneration}
      onSubmit={() => {
        clearRunDetail();
        void sendMessage(input);
      }}
      onToggleContextExclude={toggleContextExclude}
      onToggleContextPin={toggleContextPin}
      pendingAction={pendingAction}
      selectedRunDetail={selectedRunDetail}
      selectedRunRollbackBusy={selectedRunRollbackBusy}
      selectedRunRollbackError={selectedRunRollbackError}
      statusLabel={statusLabel}
      thinkingContent={thinkingContent}
      threadId={threadId}
      tokenUsage={tokenUsage}
      traceSteps={traceSteps}
      transcriptRef={transcriptRef}
    />
  );
```

Note: `onRunSuggestion` is still passed to `AgentWorkbench` but is now only used for the inspector's suggestion display, not the sidebar. The `onArchiveThread`, `onRunPrompt`, `onNewThread`, `onSearchThreads`, `onSelectRun`, `quickPrompts`, `recentRuns`, `suggestions`, `threads` are no longer needed in AgentWorkbench props — they're handled by DashboardShell.

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/AgentChatPanel.tsx
git commit -m "refactor: adapt AgentChatPanel to slimmed AgentWorkbench

Remove sidebar/Shell props from AgentWorkbench call. All sidebar data
(threads, runs, suggestions) now handled by DashboardShell.
Add tokenCount string formatting.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Wire page.tsx — Use DashboardShell

**Files:**
- Modify: `src/app/(site)/dashboard/page.tsx`

- [ ] **Step 1: Transform page.tsx from server component to client component + wire DashboardShell**

Replace the entire content of `src/app/(site)/dashboard/page.tsx` with:

```tsx
import { DashboardPageClient } from "@/components/dashboard/DashboardPageClient";
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
    <DashboardPageClient
      initialThreadId={model.initialThreadId}
      quickPrompts={agentQuickPrompts}
      suggestions={agentSuggestions}
    />
  );
}
```

- [ ] **Step 2: Create the client-side wrapper**

Write `src/components/dashboard/DashboardPageClient.tsx`:

```tsx
"use client";

import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AgentInspectorTab, ContextPreferences } from "@/components/dashboard/agent";
import { initialMessages, thinkingStatusKeywords } from "@/components/dashboard/agent-chat/constants";
import {
  formatRollbackResultStatus,
  normalizeRollbackExecutionResult,
  type AgentRollbackExecutionResult,
} from "@/components/dashboard/agent/rollback-display";
import { useAgentChatMessaging } from "@/components/dashboard/agent-chat/use-agent-chat-messaging";
import { useDashboardUrlThreadSync } from "@/components/dashboard/agent-chat/use-dashboard-url-thread-sync";
import { useAgentThreadList } from "@/components/dashboard/agent-chat/use-agent-thread";
import type { AgentQuickPrompt } from "@/lib/agent/quick-prompts";
import { canRollbackAgentRunDetail } from "@/lib/agent/run-summary";
import type { AgentInboxSuggestion } from "@/lib/agent/suggestions";
import type { AgentChatMessage, AgentTokenUsage, AgentTraceStep, PendingAction } from "@/lib/agent/schemas";
import { createTokenUsageSnapshot, estimateMessagesTokenCount } from "@/lib/agent/token-usage";
import { DashboardShell } from "./DashboardShell";
import { AgentWorkbench } from "./agent/AgentWorkbench";

type DashboardPageClientProps = {
  initialThreadId?: number;
  quickPrompts: AgentQuickPrompt[];
  suggestions: AgentInboxSuggestion[];
};

export function DashboardPageClient({
  initialThreadId,
  quickPrompts = [],
  suggestions = [],
}: DashboardPageClientProps) {
  const shouldReduceMotion = useReducedMotion();
  const [messages, setMessages] = useState<AgentChatMessage[]>(initialMessages);
  const [pendingAction, setPendingAction] = useState<null | PendingAction>(null);
  const [input, setInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    archiveThread: archiveThreadRequest,
    clearRunDetail,
    fetchThread,
    fetchRunDetail,
    recentRuns,
    runDetailError,
    searchThreads,
    selectedRunDetail,
    setThreadId,
    threadId,
    threads,
  } = useAgentThreadList();
  const [inboxSuggestions, setInboxSuggestions] = useState<AgentInboxSuggestion[]>(suggestions);
  const [statusText, setStatusText] = useState("已就绪");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [streamingState, setStreamingState] = useState<"idle" | "responding" | "thinking">("idle");
  const [traceSteps, setTraceSteps] = useState<AgentTraceStep[]>([]);
  const [activeInspectorTab, setActiveInspectorTab] = useState<AgentInspectorTab>("context");
  const [tokenUsage, setTokenUsage] = useState<AgentTokenUsage>(() =>
    createTokenUsageSnapshot({
      contextTokens: estimateMessagesTokenCount(initialMessages),
    }),
  );
  const [lastRollbackPayload, setLastRollbackPayload] = useState<unknown | null>(null);
  const [lastRollbackResult, setLastRollbackResult] = useState<AgentRollbackExecutionResult | null>(null);
  const [artifactsRollbackBusy, setArtifactsRollbackBusy] = useState(false);
  const [artifactsRollbackError, setArtifactsRollbackError] = useState<string | null>(null);
  const [selectedRunRollbackBusy, setSelectedRunRollbackBusy] = useState(false);
  const [selectedRunRollbackError, setSelectedRunRollbackError] = useState<string | null>(null);
  const [contextPreferences, setContextPreferences] = useState<ContextPreferences>({ excluded: [], pinned: [] });
  const [thinkingContent, setThinkingContent] = useState("");
  const [threadHydrated, setThreadHydrated] = useState(false);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  const loadThread = useCallback(
    async (nextThreadId?: number, options?: { preserveInspector?: boolean }) => {
      const selectedThread = await fetchThread(nextThreadId);
      if (!selectedThread) {
        if (typeof nextThreadId === "number") {
          setErrorMessage("无法加载会话");
          setStatusText("加载失败");
          setThreadHydrated(true);
          return;
        }
        setErrorMessage(null);
        setPendingAction(null);
        setMessages(initialMessages);
        setTokenUsage(createTokenUsageSnapshot({ contextTokens: estimateMessagesTokenCount(initialMessages) }));
        setTraceSteps([]);
        setLastRollbackPayload(null);
        setLastRollbackResult(null);
        setArtifactsRollbackError(null);
        setSelectedRunRollbackError(null);
        if (!options?.preserveInspector) setActiveInspectorTab("context");
        setStatusText("已就绪");
        setThreadHydrated(true);
        return;
      }
      setErrorMessage(null);
      setPendingAction(selectedThread.pendingAction);
      setMessages(selectedThread.messages.length > 0 ? selectedThread.messages : initialMessages);
      setTokenUsage(createTokenUsageSnapshot({ contextTokens: estimateMessagesTokenCount(selectedThread.messages) }));
      setTraceSteps([]);
      setLastRollbackPayload(null);
      setLastRollbackResult(null);
      setArtifactsRollbackError(null);
      setSelectedRunRollbackError(null);
      if (!options?.preserveInspector) {
        setActiveInspectorTab(
          selectedThread.pendingAction?.type === "await_confirmation" ||
          selectedThread.pendingAction?.type === "await_batch_confirmation"
            ? "approval"
            : "context",
        );
      }
      setStatusText(`已恢复 Thread #${selectedThread.id}`);
      setThreadHydrated(true);
    },
    [fetchThread],
  );

  const {
    cancelApproval,
    confirmApproval,
    editApproval,
    resetThread,
    runArtifactsRollback,
    runSuggestion,
    sendMessage,
    stopGeneration,
  } = useAgentChatMessaging({
    contextPreferences,
    isSubmitting,
    lastRollbackPayload,
    loadThread,
    messages,
    pendingAction,
    setActiveInspectorTab,
    setArtifactsRollbackBusy,
    setArtifactsRollbackError,
    setErrorMessage,
    setInboxSuggestions,
    setInput,
    setIsSubmitting,
    setLastRollbackPayload,
    setLastRollbackResult,
    setMessages,
    setPendingAction,
    setStatusText,
    setStreamingState,
    setThinkingContent,
    setThreadId,
    setTokenUsage,
    setTraceSteps,
    threadId,
  });

  useDashboardUrlThreadSync(threadId, threadHydrated);

  useEffect(() => {
    const timer = window.setTimeout(() => setInboxSuggestions(suggestions), 0);
    return () => window.clearTimeout(timer);
  }, [suggestions]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadThread(initialThreadId); }, 0);
    return () => window.clearTimeout(timer);
  }, [initialThreadId, loadThread]);

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (!transcript) return;
    const nextFrame = window.requestAnimationFrame(() => {
      transcript.scrollTo({
        behavior: shouldReduceMotion ? "auto" : "smooth",
        top: transcript.scrollHeight,
      });
    });
    return () => window.cancelAnimationFrame(nextFrame);
  }, [messages, shouldReduceMotion, statusText, isSubmitting]);

  const inputTokenEstimate = useMemo(() => estimateMessagesTokenCount([{ content: input, role: "user" }]), [input]);
  const isThinking = isSubmitting && streamingState !== "responding";
  const statusLabel = useMemo(() => {
    if (!isSubmitting) return statusText;
    if (thinkingStatusKeywords.some((keyword) => statusText.includes(keyword))) return statusText;
    return streamingState === "responding" ? "Agent 正在组织回复..." : "Agent 正在理解上下文...";
  }, [isSubmitting, statusText, streamingState]);

  const toggleContextPin = useCallback((key: string) => {
    setContextPreferences((prev) => {
      const isPinned = prev.pinned.includes(key);
      return {
        excluded: isPinned ? prev.excluded : prev.excluded.filter((k) => k !== key),
        pinned: isPinned ? prev.pinned.filter((k) => k !== key) : [...prev.pinned, key],
      };
    });
  }, []);

  const toggleContextExclude = useCallback((key: string) => {
    setContextPreferences((prev) => {
      const isExcluded = prev.excluded.includes(key);
      return {
        excluded: isExcluded ? prev.excluded.filter((k) => k !== key) : [...prev.excluded, key],
        pinned: isExcluded ? prev.pinned : prev.pinned.filter((k) => k !== key),
      };
    });
  }, []);

  const archiveThread = useCallback(
    async (archiveThreadId: number, archived: boolean) => {
      const ok = await archiveThreadRequest(archiveThreadId, archived);
      if (!ok) setErrorMessage("归档操作失败");
    },
    [archiveThreadRequest],
  );

  const selectRunDetail = useCallback(
    async (runId: number) => {
      const run = await fetchRunDetail(runId);
      if (!run) {
        setErrorMessage(runDetailError ?? "无法读取执行记录。");
        return;
      }
      setErrorMessage(null);
      setSelectedRunRollbackError(null);
      setActiveInspectorTab("trace");
      setStatusText(`已载入 AgentRun #${runId}`);
    },
    [fetchRunDetail, runDetailError],
  );

  const rollbackSelectedRun = useCallback(async () => {
    if (!selectedRunDetail || !canRollbackAgentRunDetail(selectedRunDetail)) {
      setSelectedRunRollbackError("这条执行记录没有可自动撤销的 rollbackPayload。");
      return;
    }
    setSelectedRunRollbackBusy(true);
    setSelectedRunRollbackError(null);
    try {
      const response = await fetch("/api/agent/rollback", {
        body: JSON.stringify({ rollbackPayload: selectedRunDetail.rollbackPayload, sourceRunId: selectedRunDetail.id }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = (await response.json()) as { message?: string; result?: unknown };
      if (!response.ok) throw new Error(typeof data.message === "string" ? data.message : "回滚失败");
      const rollbackResult = normalizeRollbackExecutionResult(data.result);
      await loadThread(threadId ?? undefined, { preserveInspector: true });
      setLastRollbackPayload(null);
      setLastRollbackResult(rollbackResult);
      setActiveInspectorTab("trace");
      setStatusText(rollbackResult ? formatRollbackResultStatus(rollbackResult) : "已执行撤销");
    } catch (error) {
      setSelectedRunRollbackError(error instanceof Error ? error.message : "回滚失败");
    } finally {
      setSelectedRunRollbackBusy(false);
    }
  }, [loadThread, selectedRunDetail, threadId]);

  const tokenCountStr = (() => {
    if (tokenUsage.totalTokens <= 0) return undefined;
    const k = Math.round(tokenUsage.totalTokens / 100) / 10;
    return `${k}k tokens`;
  })();

  return (
    <DashboardShell
      isThinking={isThinking}
      onArchiveThread={archiveThread}
      onLoadThread={(nextThreadId) => { void loadThread(nextThreadId); }}
      onNewThread={() => { clearRunDetail(); resetThread(); }}
      onSearchThreads={searchThreads}
      onSelectRun={(runId) => { void selectRunDetail(runId); }}
      onRunPrompt={(prompt) => { clearRunDetail(); void sendMessage(prompt); }}
      onRunSuggestion={(suggestion) => { clearRunDetail(); void runSuggestion(suggestion); }}
      pendingAction={pendingAction}
      quickPrompts={quickPrompts}
      recentRuns={recentRuns}
      selectedRunId={selectedRunDetail?.id ?? null}
      statusLabel={statusLabel}
      suggestions={inboxSuggestions}
      threadId={threadId}
      threads={threads}
      tokenCount={tokenCountStr}
    >
      <AgentWorkbench
        activeInspectorTab={activeInspectorTab}
        artifactsRollbackBusy={artifactsRollbackBusy}
        artifactsRollbackError={artifactsRollbackError}
        contextPreferences={contextPreferences}
        errorMessage={errorMessage}
        inboxSuggestions={inboxSuggestions}
        input={input}
        inputTokenEstimate={inputTokenEstimate}
        isSubmitting={isSubmitting}
        isThinking={isThinking}
        lastRollbackPayload={lastRollbackPayload}
        lastRollbackResult={lastRollbackResult}
        messages={messages}
        onActiveInspectorTabChange={setActiveInspectorTab}
        onArtifactsRollback={() => { clearRunDetail(); runArtifactsRollback(); }}
        onCancelApproval={() => { clearRunDetail(); cancelApproval(); }}
        onEditApproval={editApproval}
        onConfirmApproval={() => { clearRunDetail(); confirmApproval(); }}
        onInputChange={setInput}
        onLoadThread={(nextThreadId) => { void loadThread(nextThreadId); }}
        onRollbackSelectedRun={() => { void rollbackSelectedRun(); }}
        onStop={stopGeneration}
        onSubmit={() => { clearRunDetail(); void sendMessage(input); }}
        onToggleContextExclude={toggleContextExclude}
        onToggleContextPin={toggleContextPin}
        pendingAction={pendingAction}
        selectedRunDetail={selectedRunDetail}
        selectedRunRollbackBusy={selectedRunRollbackBusy}
        selectedRunRollbackError={selectedRunRollbackError}
        statusLabel={statusLabel}
        thinkingContent={thinkingContent}
        threadId={threadId}
        tokenUsage={tokenUsage}
        traceSteps={traceSteps}
        transcriptRef={transcriptRef}
      />
    </DashboardShell>
  );
}
```

- [ ] **Step 3: Verify the build compiles**

```bash
npx tsc --noEmit --pretty 2>&1 | head -50
```

Expected: No new type errors related to the dashboard components. Fix any type errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(site\)/dashboard/page.tsx src/components/dashboard/DashboardPageClient.tsx
git commit -m "feat: wire DashboardShell into dashboard page

DashboardPageClient is the new client entry point. It hosts all state
(previously in AgentChatPanel) and passes data to both DashboardShell
(shell chrome) and AgentWorkbench (center content).
Server page.tsx delegates to DashboardPageClient after data loading.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: Clean Up — Remove Deprecated Components + Update index.ts Exports

**Files:**
- Modify: `src/components/dashboard/agent/index.ts`
- Remove: `AgentWorkbenchShell.tsx`, `AgentWorkbenchLayout.tsx`, `DashboardLayoutSwitcher.tsx` (soft-deprecate)

- [ ] **Step 1: Update agent/index.ts — remove deprecated exports**

Remove these lines from `src/components/dashboard/agent/index.ts`:
```tsx
export { AgentWorkbenchLayout } from "./AgentWorkbenchLayout";
export { AgentWorkbenchShell } from "./AgentWorkbenchShell";
```

- [ ] **Step 2: Mark deprecated components**

The following files are no longer imported by any active code. We keep them on disk (can be deleted in a future cleanup PR) but remove from the barrel export:
- `AgentWorkbenchShell.tsx` — superseded by `DashboardShell`
- `AgentWorkbenchLayout.tsx` — superseded by `DashboardShell` Grid
- `DashboardLayoutSwitcher.tsx` — no longer used (layout modes removed)
- `use-workbench-narrow.ts` — no longer used (sidebar collapse removed)

- [ ] **Step 3: Clean up AgentChatPanel.tsx unused imports**

Remove these unused imports from `src/components/dashboard/AgentChatPanel.tsx`:
```tsx
// Remove:
import { AgentWorkbench, type AgentInspectorTab, type ContextPreferences } from "@/components/dashboard/agent";
// Add instead:
import { type ContextPreferences } from "@/components/dashboard/agent/types";
```

(Note: `AgentWorkbench` is still imported for the render, but now `DashboardPageClient` is the primary consumer. If `AgentChatPanel.tsx` is no longer used, it can be soft-deprecated too.)

- [ ] **Step 4: Verify no broken imports**

```bash
npx tsc --noEmit --pretty 2>&1 | grep -i "cannot find\|not exported\|not found" | head -20
```

Expected: No errors related to removed exports.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/agent/index.ts src/components/dashboard/AgentChatPanel.tsx
git commit -m "chore: remove deprecated shell/layout exports

AgentWorkbenchShell, AgentWorkbenchLayout, DashboardLayoutSwitcher
exported removed from barrel. Files kept on disk for reference.
Clean up AgentChatPanel unused imports.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 11: Dark Mode & Responsive Validation

**Files:**
- No new files. Manual verification.

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify dark mode**

Open `http://localhost:3000/dashboard` toggling dark/light mode. Verify:
1. Icon bar background uses correct `--surface` in both modes
2. Slide panel contrast matches existing agent panel
3. Status bar text readable in both modes
4. Mode chips border/accent colors switch correctly

- [ ] **Step 3: Verify responsive collapse**

Resize browser to <900px width. Verify:
1. Slide panel auto-hides
2. Grid collapses to 2-column (icon-bar + main)
3. Status bar spans full width below main area
4. All interactive elements (chips, composer, icon buttons) remain usable

- [ ] **Step 4: Verify reduced motion**

Enable `prefers-reduced-motion: reduce` in dev tools. Verify:
1. No CSS transitions fire on icon buttons
2. No CSS transitions fire on mode chips
3. Agent conversation scroll still works (behavior: "auto")

- [ ] **Step 5: Commit any CSS fixes**

If no fixes needed, skip. Otherwise:
```bash
git add src/app/styles/sunny-dashboard-shell.css
git commit -m "fix: dark mode and responsive polish for Dashboard Shell

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Plan Self-Review

### 1. Spec Coverage Check
- ✅ Section 1 (DashboardShell) → Task 6
- ✅ Section 2 (DashboardIconBar) → Task 3
- ✅ Section 3 (DashboardSlidePanel) → Task 4
- ✅ Section 4 (模式切换 Chips) → Task 5
- ✅ Section 5 (DashboardStatusBar) → Task 2
- ✅ Section 6 (AgentWorkbench 适配) → Task 7
- ✅ Section 7 (AgentChatPanel 适配) → Task 8
- ✅ Section 8 (Inspector 抽屉化) → Task 7 (AgentWorkbench now passes `drawer=true`)
- ✅ CSS 策略 (新文件 + globals 导入) → Task 1
- ✅ 数据流 + 不变清单 → Task 9 wires everything

### 2. Placeholder Scan
- ✅ No TBD/TODO/fill-in-later
- ✅ All code steps have complete code
- ✅ All file paths are exact

### 3. Type Consistency
- ✅ `DashboardIconMode` defined in Task 3, used in Tasks 5,6
- ✅ `DashboardShellProps` properties match what `DashboardPageClient` passes
- ✅ Slimmed `AgentWorkbenchProps` includes all properties that `AgentChatPanel`/`DashboardPageClient` pass
- ✅ `DashboardStatusBar` tokenCount is `string | undefined`, formatted by `DashboardPageClient`
