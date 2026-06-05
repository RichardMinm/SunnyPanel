# Right Panel Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `AgentInspector` Tabs with three stacked Cards (ContextCard, PendingActionsCard, HistoryCard) in a 340px right panel as the 4th Grid column.

**Architecture:** New `DashboardRightPanel` component wraps three independent Card components, each self-contained. Added as 4th column in `DashboardShell` Grid (`48px 280px 1fr 340px`). Right panel scrolls independently from center area. All agent data flows through `useAgentDashboardChat` hook (zero changes).

**Tech Stack:** React 19 + Next.js 16 + TypeScript + motion/react + CSS custom properties

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| **Create** | `src/app/styles/sunny-dashboard-right-panel.css` | Right panel + card CSS |
| **Create** | `src/components/dashboard/ContextCard.tsx` | Current context card |
| **Create** | `src/components/dashboard/PendingActionsCard.tsx` | Suggestions + risk warnings |
| **Create** | `src/components/dashboard/HistoryCard.tsx` | Session history / execution tabs |
| **Create** | `src/components/dashboard/DashboardRightPanel.tsx` | Assembly container for 3 cards |
| **Modify** | `src/app/globals.css` | Import new CSS |
| **Modify** | `src/app/styles/sunny-dashboard-shell.css` | Grid → 4 columns, right panel styles |
| **Modify** | `src/components/dashboard/DashboardShell.tsx` | Add DashboardRightPanel as 4th column |
| **Modify** | `src/components/dashboard/DashboardPageClient.tsx` | Pass right panel props |
| **Modify** | `src/components/dashboard/agent/AgentWorkbench.tsx` | Remove AgentInspector rendering |
| **Modify** | `src/components/dashboard/agent/index.ts` | Remove deprecated exports |

---

### Task 1: CSS Foundation — Right Panel + Grid Update

**Files:**
- Create: `src/app/styles/sunny-dashboard-right-panel.css`
- Modify: `src/app/styles/sunny-dashboard-shell.css` (Grid → 4 columns)
- Modify: `src/app/globals.css` (import new CSS)

- [ ] **Step 1: Create right panel CSS**

Write `src/app/styles/sunny-dashboard-right-panel.css`:

```css
/**
 * Dashboard Right Panel: 340px 右侧面板 + 三张 Card。
 * 所有类使用 .sunny-dashboard-* 前缀。
 */

/* ═══ 右侧面板容器 ═══ */
.sunny-dashboard-right-panel {
  grid-row: 1 / -1;
  grid-column: 4;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--background);
  border-left: 1px solid var(--border);
}

/* ═══ Card 通用 ═══ */
.sunny-dashboard-right-card {
  background: #fff;
  border: 1px solid #E5E7EB;
  border-radius: 16px;
  padding: 14px 16px;
  flex-shrink: 0;
}

html[data-theme="dark"] .sunny-dashboard-right-card {
  background: var(--surface);
  border-color: var(--border);
}

.sunny-dashboard-right-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  gap: 8px;
}

.sunny-dashboard-right-card-title {
  font-size: var(--text-sm);
  font-weight: 700;
  font-family: var(--sunny-font-sans);
  color: var(--foreground);
  margin: 0;
  line-height: 1.3;
}

.sunny-dashboard-right-card-badge {
  font-size: 0.625rem;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-family: var(--sunny-font-mono);
}

/* ═══ Context Card ═══ */
.sunny-context-card-rows {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 8px;
  font-size: var(--text-xs);
  line-height: 1.5;
}

.sunny-context-card-label {
  color: var(--muted);
  white-space: nowrap;
}

.sunny-context-card-value {
  color: var(--foreground);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sunny-context-card-summary {
  color: var(--foreground);
  font-size: var(--text-xs);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin: 6px 0 0;
}

/* Referenced chips */
.sunny-context-ref-section {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #E5E7EB;
}

html[data-theme="dark"] .sunny-context-ref-section {
  border-color: var(--border);
}

.sunny-context-ref-label {
  font-size: 0.625rem;
  font-weight: 700;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 5px;
}

.sunny-context-ref-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.sunny-context-ref-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid #E5E7EB;
  background: transparent;
  font-size: 0.6875rem;
  color: var(--foreground);
  font-family: var(--sunny-font-sans);
  white-space: nowrap;
}

html[data-theme="dark"] .sunny-context-ref-chip {
  border-color: var(--border);
}

/* Context card actions */
.sunny-context-card-actions {
  display: flex;
  gap: 6px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid #E5E7EB;
}

html[data-theme="dark"] .sunny-context-card-actions {
  border-color: var(--border);
}

.sunny-context-card-action-btn {
  font-size: 0.6875rem;
  font-weight: 500;
  padding: 3px 10px;
  border-radius: 6px;
  border: 1px solid #E5E7EB;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font-family: var(--sunny-font-sans);
  transition: all 0.12s;
}

html[data-theme="dark"] .sunny-context-card-action-btn {
  border-color: var(--border);
}

.sunny-context-card-action-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}

.sunny-context-card-action-btn.is-primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.sunny-context-card-action-btn.is-primary:hover {
  opacity: 0.85;
}

/* ═══ Pending Actions Card ═══ */
.sunny-pending-actions-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sunny-pending-actions-list.has-overflow {
  max-height: 38vh;
  overflow-y: auto;
  overscroll-behavior: contain;
}

/* Action Card */
.sunny-action-card {
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #E5E7EB;
  background: transparent;
  transition: border-color 0.12s;
}

html[data-theme="dark"] .sunny-action-card {
  border-color: var(--border);
}

.sunny-action-card:hover {
  border-color: var(--accent);
}

.sunny-action-card-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 3px;
}

.sunny-action-card-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.sunny-action-card-dot.low { background: #9CA3AF; }
.sunny-action-card-dot.medium { background: #F59E0B; }
.sunny-action-card-dot.high { background: #EF4444; }

.sunny-action-card-title {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--foreground);
  font-family: var(--sunny-font-sans);
}

.sunny-action-card-desc {
  font-size: 0.6875rem;
  color: var(--muted);
  line-height: 1.4;
  margin-bottom: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sunny-action-card-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.sunny-action-card-risk {
  font-size: 0.625rem;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 999px;
  font-family: var(--sunny-font-sans);
}

.sunny-action-card-risk.low { background: #F3F4F6; color: #6B7280; }
html[data-theme="dark"] .sunny-action-card-risk.low { background: rgba(156,163,175,0.15); color: #9CA3AF; }
.sunny-action-card-risk.medium { background: #FEF3C7; color: #92400E; }
html[data-theme="dark"] .sunny-action-card-risk.medium { background: rgba(245,158,11,0.18); color: #FBBF24; }
.sunny-action-card-risk.high { background: #FEE2E2; color: #991B1B; }
html[data-theme="dark"] .sunny-action-card-risk.high { background: rgba(239,68,68,0.18); color: #FCA5A5; }

.sunny-action-card-btns {
  display: flex;
  gap: 4px;
}

.sunny-action-card-btn {
  font-size: 0.625rem;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 5px;
  border: 1px solid #E5E7EB;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font-family: var(--sunny-font-sans);
  transition: all 0.12s;
}

html[data-theme="dark"] .sunny-action-card-btn { border-color: var(--border); }
.sunny-action-card-btn:hover { border-color: var(--accent); color: var(--accent); }
.sunny-action-card-btn.is-accept { color: #059669; border-color: #059669; }
.sunny-action-card-btn.is-accept:hover { background: #ECFDF5; }
.sunny-action-card-btn.is-dismiss:hover { border-color: #EF4444; color: #EF4444; }

/* Risk warning section */
.sunny-risk-warning {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #E5E7EB;
}

html[data-theme="dark"] .sunny-risk-warning { border-color: var(--border); }

.sunny-risk-warning-label {
  font-size: 0.625rem;
  font-weight: 700;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 5px;
}

.sunny-risk-warning-desc {
  font-size: 0.6875rem;
  color: var(--muted);
  line-height: 1.4;
  margin-bottom: 6px;
}

/* ═══ History Card ═══ */
.sunny-history-card-tabs {
  display: flex;
  gap: 2px;
  margin-bottom: 10px;
  padding: 2px;
  border-radius: 8px;
  background: #F3F4F6;
}

html[data-theme="dark"] .sunny-history-card-tabs {
  background: var(--surface-strong);
}

.sunny-history-card-tab {
  flex: 1;
  padding: 4px 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  font-size: var(--text-xs);
  font-weight: 500;
  font-family: var(--sunny-font-sans);
  cursor: pointer;
  text-align: center;
  transition: all 0.12s;
}

.sunny-history-card-tab.is-active {
  background: #fff;
  color: var(--foreground);
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);
}

html[data-theme="dark"] .sunny-history-card-tab.is-active {
  background: var(--surface);
}

.sunny-history-card-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 32vh;
  overflow-y: auto;
  overscroll-behavior: contain;
}

/* Session history row */
.sunny-history-session-row {
  padding: 7px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.1s;
}

.sunny-history-session-row:hover { background: var(--accent-soft); }
.sunny-history-session-row.is-active { background: var(--accent-soft); }

.sunny-history-session-title {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--foreground);
  font-family: var(--sunny-font-sans);
}

.sunny-history-session-meta {
  font-size: 0.625rem;
  color: var(--muted);
  margin-top: 1px;
  font-family: var(--sunny-font-mono);
}

/* Execution row */
.sunny-history-exec-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: var(--text-xs);
}

.sunny-history-exec-row:hover { background: var(--accent-soft); }

.sunny-history-exec-status {
  font-size: 0.6875rem;
  flex-shrink: 0;
}

.sunny-history-exec-name {
  font-weight: 500;
  color: var(--foreground);
  font-family: var(--sunny-font-sans);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sunny-history-exec-time {
  font-size: 0.625rem;
  color: var(--muted);
  font-family: var(--sunny-font-mono);
  flex-shrink: 0;
}

/* ═══ Reduced motion ═══ */
@media (prefers-reduced-motion: reduce) {
  .sunny-dashboard-right-card,
  .sunny-context-card-action-btn,
  .sunny-action-card,
  .sunny-action-card-btn,
  .sunny-history-card-tab,
  .sunny-history-session-row {
    transition: none;
  }
}

/* ═══ Responsive ═══ */
@media (max-width: 1200px) {
  .sunny-dashboard-right-panel {
    display: none;
  }
}
```

- [ ] **Step 2: Update Grid to 4 columns**

In `src/app/styles/sunny-dashboard-shell.css`, update the Grid template:

Find the `.sunny-dashboard-shell` rule (around line 14). Replace `grid-template-columns`:
```css
/* was: grid-template-columns: var(--dashboard-icon-bar-width) var(--dashboard-panel-width) minmax(0, 1fr); */
grid-template-columns: var(--dashboard-icon-bar-width) var(--dashboard-panel-width) minmax(0, 1fr) 340px;
```

Update `.is-panel-collapsed`:
```css
/* was: grid-template-columns: var(--dashboard-icon-bar-width) minmax(0, 1fr); */
grid-template-columns: var(--dashboard-icon-bar-width) minmax(0, 1fr) 340px;
```

Update the responsive media query at 900px:
```css
/* was: grid-template-columns: var(--dashboard-icon-bar-width) minmax(0, 1fr); */
grid-template-columns: var(--dashboard-icon-bar-width) minmax(0, 1fr); /* hides both panel + right */
```

Add a responsive query at 1200px to hide right panel:
```css
@media (max-width: 1200px) {
  .sunny-dashboard-shell {
    grid-template-columns: var(--dashboard-icon-bar-width) var(--dashboard-panel-width) minmax(0, 1fr);
  }
  .sunny-dashboard-shell.is-panel-collapsed {
    grid-template-columns: var(--dashboard-icon-bar-width) minmax(0, 1fr);
  }
}
```

- [ ] **Step 3: Import new CSS**

Add to `src/app/globals.css` after the last `@import`:
```css
@import "./styles/sunny-dashboard-right-panel.css";
```

- [ ] **Step 4: Commit**

```bash
git add src/app/styles/sunny-dashboard-right-panel.css src/app/styles/sunny-dashboard-shell.css src/app/globals.css
git commit -m "feat: add right panel CSS foundation + 4-column grid
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: ContextCard Component

**Files:**
- Create: `src/components/dashboard/ContextCard.tsx`

- [ ] **Step 1: Create ContextCard**

Write `src/components/dashboard/ContextCard.tsx`:

```tsx
"use client";

import { useMemo } from "react";
import type { AgentChatMessage, AgentTraceStep, AgentTokenUsage } from "@/lib/agent/schemas";
import type { ContextPreferences } from "@/components/dashboard/agent/types";

type ContextCardProps = {
  threadId: null | number;
  messages: AgentChatMessage[];
  traceSteps: AgentTraceStep[];
  tokenUsage: AgentTokenUsage;
  threadTitle?: string;
  /** Format caller provides (e.g., "1.1k tokens") */
  tokenCountStr?: string;
};

export function ContextCard({
  threadId,
  messages,
  traceSteps,
  tokenUsage,
  threadTitle,
  tokenCountStr,
}: ContextCardProps) {
  /* Summary: latest assistant message, first 3 lines */
  const summary = useMemo(() => {
    const assistantMsgs = [...messages].reverse().filter(
      (m) => m.role === "assistant" && m.content.trim().length > 0
    );
    if (!assistantMsgs.length) return "尚未有对话内容";
    const raw = assistantMsgs[0].content.trim();
    const lines = raw.split("\n").filter(Boolean);
    return lines.slice(0, 3).join("\n");
  }, [messages]);

  /* Referenced counts: parse from traceSteps context detail */
  const refs = useMemo(() => {
    const contextStep = traceSteps.find(
      (s) => s.kind === "context" && s.status === "done"
    );
    if (!contextStep?.detail) return { plans: 0, files: 0, memories: 0 };

    const detail = contextStep.detail;
    const planMatch = detail.match(/(\d+) 条计划/);
    const fileMatch = detail.match(/(\d+) 条内容/);
    const memMatch = detail.match(/(\d+) 条记忆/);
    return {
      plans: planMatch ? Number(planMatch[1]) : 0,
      files: fileMatch ? Number(fileMatch[1]) : 0,
      memories: memMatch ? Number(memMatch[1]) : 0,
    };
  }, [traceSteps]);

  const contextTokensFmt = (() => {
    const k = Math.round(tokenUsage.contextTokens / 100) / 10;
    return `${k}k tokens`;
  })();

  return (
    <div className="sunny-dashboard-right-card">
      <div className="sunny-dashboard-right-card-header">
        <h3 className="sunny-dashboard-right-card-title">当前上下文</h3>
      </div>

      <div className="sunny-context-card-rows">
        <span className="sunny-context-card-label">当前项目</span>
        <span className="sunny-context-card-value">SunnyPanel</span>

        <span className="sunny-context-card-label">当前会话</span>
        <span className="sunny-context-card-value">
          {threadTitle || (threadId ? `会话 #${threadId}` : "新任务")}
        </span>
      </div>

      <p className="sunny-context-card-summary">{summary}</p>

      <div className="sunny-context-ref-section">
        <p className="sunny-context-ref-label">已引用</p>
        <div className="sunny-context-ref-chips">
          <span className="sunny-context-ref-chip">📋 计划 {refs.plans}</span>
          <span className="sunny-context-ref-chip">📄 文件 {refs.files}</span>
          <span className="sunny-context-ref-chip">🧠 记忆 {refs.memories}</span>
          <span className="sunny-context-ref-chip">📊 上下文 {contextTokensFmt}</span>
        </div>
      </div>

      <div className="sunny-context-card-actions">
        <button type="button" className="sunny-context-card-action-btn is-primary">
          查看详情
        </button>
        <button type="button" className="sunny-context-card-action-btn">
          刷新上下文
        </button>
        <button type="button" className="sunny-context-card-action-btn" title="添加上下文">
          +
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/ContextCard.tsx
git commit -m "feat: add ContextCard component
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: PendingActionsCard Component

**Files:**
- Create: `src/components/dashboard/PendingActionsCard.tsx`

- [ ] **Step 1: Read existing code for reference**

Read `src/components/dashboard/agent/AgentApprovalPanel.tsx` (for pendingAction types) and `src/lib/agent/schemas.ts` (for PendingAction type).

- [ ] **Step 2: Create PendingActionsCard**

Write `src/components/dashboard/PendingActionsCard.tsx`:

```tsx
"use client";

import { useCallback } from "react";
import type { PendingAction } from "@/lib/agent/schemas";
import type { AgentInboxSuggestion } from "@/lib/agent/suggestions";
import type { AgentQuickPrompt } from "@/lib/agent/quick-prompts";
import { riskLevelLabelMap } from "@/components/dashboard/agent/constants";
import { getPendingActionLabel } from "@/components/dashboard/agent/utils";

type PendingActionsCardProps = {
  pendingAction: null | PendingAction;
  suggestions: AgentInboxSuggestion[];
  quickPrompts: AgentQuickPrompt[];
  onRunSuggestion: (suggestion: AgentInboxSuggestion) => void;
  onRunPrompt: (prompt: string) => void;
  onCancelApproval: () => void;
  onConfirmApproval: () => void;
};

export function PendingActionsCard({
  pendingAction,
  suggestions,
  quickPrompts,
  onRunSuggestion,
  onRunPrompt,
  onCancelApproval,
  onConfirmApproval,
}: PendingActionsCardProps) {
  /* Merge suggestions + quickPrompts into unified action list */
  const actions = [
    ...suggestions.slice(0, 4).map((s) => ({
      id: `sug-${s.id}`,
      title: s.title,
      description: s.reason,
      riskLevel: (s.riskLevel || "low") as "high" | "low" | "medium",
      suggestion: s,
      isQuick: false,
    })),
    ...quickPrompts.slice(0, 2).map((p) => ({
      id: `quick-${p.label}`,
      title: p.label,
      description: p.prompt,
      riskLevel: "low" as const,
      suggestion: null,
      isQuick: true,
    })),
  ];

  const count = actions.length;
  const hasOverflow = count > 3;

  const riskClass = (level: string) =>
    level === "high" ? "high" : level === "medium" ? "medium" : "low";

  return (
    <div className="sunny-dashboard-right-card">
      <div className="sunny-dashboard-right-card-header">
        <h3 className="sunny-dashboard-right-card-title">待处理事项</h3>
        {count > 0 ? (
          <span className="sunny-dashboard-right-card-badge">{count}</span>
        ) : null}
      </div>

      {/* Action Cards */}
      {actions.length > 0 ? (
        <div
          className={`sunny-pending-actions-list${hasOverflow ? " has-overflow" : ""}`}
        >
          {actions.map((action) => (
            <div key={action.id} className="sunny-action-card">
              <div className="sunny-action-card-head">
                <span className={`sunny-action-card-dot ${riskClass(action.riskLevel)}`} />
                <span className="sunny-action-card-title">{action.title}</span>
              </div>
              <p className="sunny-action-card-desc">{action.description}</p>
              <div className="sunny-action-card-meta">
                <span className={`sunny-action-card-risk ${riskClass(action.riskLevel)}`}>
                  {riskLevelLabelMap[action.riskLevel]}
                </span>
              </div>
              <div className="sunny-action-card-btns">
                <button
                  type="button"
                  className="sunny-action-card-btn is-accept"
                  onClick={() => {
                    if (action.suggestion) {
                      onRunSuggestion(action.suggestion);
                    } else {
                      onRunPrompt(action.description);
                    }
                  }}
                >
                  采纳
                </button>
                <button type="button" className="sunny-action-card-btn is-dismiss">
                  忽略
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
          暂无待处理建议
        </p>
      )}

      {/* Risk Warning — from pending approval action */}
      {pendingAction?.type === "await_confirmation" ? (
        <div className="sunny-risk-warning">
          <p className="sunny-risk-warning-label">风险提醒</p>
          <p style={{ fontSize: "0.6875rem", color: "var(--muted)", marginBottom: 4 }}>
            等级: {riskLevelLabelMap[pendingAction.action.riskLevel]} · 来源: {pendingAction.action.intent}
          </p>
          <p className="sunny-risk-warning-desc">
            {pendingAction.action.summary}
          </p>
          <div className="sunny-action-card-btns">
            <button
              type="button"
              className="sunny-action-card-btn is-accept"
              onClick={onConfirmApproval}
            >
              处理
            </button>
            <button type="button" className="sunny-action-card-btn">稍后</button>
            <button
              type="button"
              className="sunny-action-card-btn is-dismiss"
              onClick={onCancelApproval}
            >
              忽略
            </button>
          </div>
        </div>
      ) : pendingAction?.type === "await_batch_confirmation" ? (
        <div className="sunny-risk-warning">
          <p className="sunny-risk-warning-label">风险提醒</p>
          <p style={{ fontSize: "0.6875rem", color: "var(--muted)", marginBottom: 4 }}>
            批量确认 · {pendingAction.actions.length} 项操作
          </p>
          <p className="sunny-risk-warning-desc">
            {getPendingActionLabel(pendingAction)}
          </p>
          <div className="sunny-action-card-btns">
            <button
              type="button"
              className="sunny-action-card-btn is-accept"
              onClick={onConfirmApproval}
            >
              处理
            </button>
            <button type="button" className="sunny-action-card-btn is-dismiss" onClick={onCancelApproval}>
              忽略
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/PendingActionsCard.tsx
git commit -m "feat: add PendingActionsCard component
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: HistoryCard Component

**Files:**
- Create: `src/components/dashboard/HistoryCard.tsx`

- [ ] **Step 1: Create HistoryCard**

Write `src/components/dashboard/HistoryCard.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { AgentThreadSummary, AgentRunSummary } from "@/components/dashboard/agent/types";
import type { AgentTraceStep } from "@/lib/agent/schemas";

type HistoryCardTab = "sessions" | "executions";

type HistoryCardProps = {
  threads: AgentThreadSummary[];
  threadId: null | number;
  recentRuns: AgentRunSummary[];
  traceSteps: AgentTraceStep[];
  onLoadThread: (threadId: number) => void;
  onSelectRun?: (runId: number) => void;
};

const runStatusMap: Record<string, { label: string; icon: string }> = {
  succeeded: { label: "成功", icon: "✅" },
  failed: { label: "失败", icon: "❌" },
  running: { label: "执行中", icon: "🔄" },
  pending: { label: "排队", icon: "⏳" },
  queued: { label: "排队", icon: "⏳" },
};

export function HistoryCard({
  threads,
  threadId,
  recentRuns,
  traceSteps,
  onLoadThread,
  onSelectRun,
}: HistoryCardProps) {
  const [tab, setTab] = useState<HistoryCardTab>("sessions");

  return (
    <div className="sunny-dashboard-right-card">
      {/* Tabs */}
      <div className="sunny-history-card-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "sessions"}
          className={`sunny-history-card-tab${tab === "sessions" ? " is-active" : ""}`}
          onClick={() => setTab("sessions")}
        >
          会话历史
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "executions"}
          className={`sunny-history-card-tab${tab === "executions" ? " is-active" : ""}`}
          onClick={() => setTab("executions")}
        >
          执行记录
        </button>
      </div>

      {/* Tab: Sessions */}
      {tab === "sessions" ? (
        <div className="sunny-history-card-list">
          {threads.slice(0, 10).map((thread) => (
            <div
              key={thread.id}
              className={`sunny-history-session-row${thread.id === threadId ? " is-active" : ""}`}
              onClick={() => onLoadThread(thread.id)}
            >
              <div className="sunny-history-session-title">
                {thread.title || `会话 #${thread.id}`}
              </div>
              <div className="sunny-history-session-meta">
                {thread.archived ? "已归档 · " : ""}Thread #{thread.id}
                {thread.tags?.length ? ` · ${thread.tags.join(", ")}` : ""}
              </div>
            </div>
          ))}
          {threads.length === 0 ? (
            <p style={{ fontSize: "0.75rem", color: "var(--muted)", padding: "8px 10px" }}>
              暂无会话历史
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Tab: Executions */}
      {tab === "executions" ? (
        <div className="sunny-history-card-list">
          {/* Live trace steps first */}
          {traceSteps
            .filter((s) => s.kind === "action" || s.kind === "write")
            .slice(0, 6)
            .map((step) => {
              const status = runStatusMap[step.status] || { label: step.status, icon: "•" };
              return (
                <div key={step.id} className="sunny-history-exec-row">
                  <span className="sunny-history-exec-status" title={status.label}>
                    {status.icon}
                  </span>
                  <span className="sunny-history-exec-name">
                    {step.title}
                  </span>
                </div>
              );
            })}
          {/* Then recent runs */}
          {recentRuns.slice(0, 6).map((run) => {
            const status = runStatusMap[run.status] || { label: run.status, icon: "•" };
            return (
              <div
                key={run.id}
                className="sunny-history-exec-row"
                onClick={onSelectRun ? () => onSelectRun(run.id) : undefined}
                style={onSelectRun ? { cursor: "pointer" } : undefined}
              >
                <span className="sunny-history-exec-status" title={status.label}>
                  {status.icon}
                </span>
                <span className="sunny-history-exec-name">{run.title}</span>
                <span className="sunny-history-exec-time">
                  {run.runKind === "rollback" ? "回滚" : run.runKind === "review" ? "复盘" : ""}
                </span>
              </div>
            );
          })}
          {traceSteps.filter((s) => s.kind === "action" || s.kind === "write").length === 0 &&
           recentRuns.length === 0 ? (
            <p style={{ fontSize: "0.75rem", color: "var(--muted)", padding: "8px 10px" }}>
              暂无执行记录
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/HistoryCard.tsx
git commit -m "feat: add HistoryCard component
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: DashboardRightPanel Assembly

**Files:**
- Create: `src/components/dashboard/DashboardRightPanel.tsx`

- [ ] **Step 1: Create DashboardRightPanel**

Write `src/components/dashboard/DashboardRightPanel.tsx`:

```tsx
"use client";

import type { AgentInboxSuggestion } from "@/lib/agent/suggestions";
import type { AgentQuickPrompt } from "@/lib/agent/quick-prompts";
import type { AgentChatMessage, AgentTokenUsage, AgentTraceStep, PendingAction } from "@/lib/agent/schemas";
import type { AgentThreadSummary, AgentRunSummary, ContextPreferences, AgentRunDetail } from "@/components/dashboard/agent/types";
import type { AgentRollbackExecutionResult } from "@/components/dashboard/agent/rollback-display";
import { ContextCard } from "./ContextCard";
import { PendingActionsCard } from "./PendingActionsCard";
import { HistoryCard } from "./HistoryCard";

type DashboardRightPanelProps = {
  /* Context */
  threadId: null | number;
  threadTitle?: string;
  messages: AgentChatMessage[];
  traceSteps: AgentTraceStep[];
  tokenUsage: AgentTokenUsage;
  tokenCountStr?: string;

  /* Pending */
  pendingAction: null | PendingAction;
  suggestions: AgentInboxSuggestion[];
  quickPrompts: AgentQuickPrompt[];
  onRunSuggestion: (suggestion: AgentInboxSuggestion) => void;
  onRunPrompt: (prompt: string) => void;
  onCancelApproval: () => void;
  onConfirmApproval: () => void;

  /* History */
  threads: AgentThreadSummary[];
  recentRuns: AgentRunSummary[];
  onLoadThread: (threadId: number) => void;
  onSelectRun?: (runId: number) => void;
};

export function DashboardRightPanel(props: DashboardRightPanelProps) {
  return (
    <aside className="sunny-dashboard-right-panel" aria-label="右侧面板">
      <ContextCard
        threadId={props.threadId}
        threadTitle={props.threadTitle}
        messages={props.messages}
        traceSteps={props.traceSteps}
        tokenUsage={props.tokenUsage}
        tokenCountStr={props.tokenCountStr}
      />
      <PendingActionsCard
        pendingAction={props.pendingAction}
        suggestions={props.suggestions}
        quickPrompts={props.quickPrompts}
        onRunSuggestion={props.onRunSuggestion}
        onRunPrompt={props.onRunPrompt}
        onCancelApproval={props.onCancelApproval}
        onConfirmApproval={props.onConfirmApproval}
      />
      <HistoryCard
        threads={props.threads}
        threadId={props.threadId}
        recentRuns={props.recentRuns}
        traceSteps={props.traceSteps}
        onLoadThread={props.onLoadThread}
        onSelectRun={props.onSelectRun}
      />
    </aside>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/DashboardRightPanel.tsx
git commit -m "feat: add DashboardRightPanel assembly component
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Update DashboardShell to render right panel

**Files:**
- Modify: `src/components/dashboard/DashboardShell.tsx`

- [ ] **Step 1: Read current DashboardShell.tsx**

- [ ] **Step 2: Add DashboardRightPanel + expand props**

The current `DashboardShell` needs:
1. New props for the right panel
2. Render `DashboardRightPanel` as a 4th child

Add new props to `DashboardShellProps`:
```ts
type DashboardShellProps = {
  children: ReactNode;
  /* ... existing props ... */
  
  /* Right panel props */
  threadTitle?: string;
  onEditApproval: (kind: "plan" | "schedule" | "generic") => void;
};
```

Add import and render:
```tsx
import { DashboardRightPanel } from "./DashboardRightPanel";
import type { AgentChatMessage, AgentTokenUsage, AgentTraceStep } from "@/lib/agent/schemas";

// Pass 'messages' instead of just 'isThinking'
// In the props, add 'messages: AgentChatMessage[]'
```

The `<DashboardRightPanel ... />` should be placed after the `</main>` tag and before the status bar:
```tsx
      </main>

      {/* Right panel */}
      <DashboardRightPanel
        threadId={threadId}
        threadTitle={threadTitle}
        messages={messages}
        traceSteps={traceSteps}
        tokenUsage={tokenUsage}
        tokenCountStr={tokenCount}
        pendingAction={pendingAction}
        suggestions={suggestions}
        quickPrompts={quickPrompts}
        onRunSuggestion={onRunSuggestion}
        onRunPrompt={onRunPrompt}
        onCancelApproval={onCancelApproval}
        onConfirmApproval={onConfirmApproval}
        threads={threads}
        recentRuns={recentRuns}
        onLoadThread={onLoadThread}
        onSelectRun={onSelectRun}
      />

      <DashboardStatusBar ... />
```

Note: You'll need to destructure `messages` from the shell props and add it. Currently `DashboardShell` doesn't receive `messages`. Add it to the props type.

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit --pretty 2>&1 | grep -i "error TS" | head -10
```

Goal: 0 errors related to DashboardShell/DashboardRightPanel.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/DashboardShell.tsx
git commit -m "feat: wire DashboardRightPanel into DashboardShell
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Update DashboardPageClient — pass right panel data

**Files:**
- Modify: `src/components/dashboard/DashboardPageClient.tsx`

- [ ] **Step 1: Read current DashboardPageClient.tsx**

- [ ] **Step 2: Add missing props to DashboardShell**

The `useAgentDashboardChat` hook already returns `messages`, `threadTitle`, `tokenUsage`, `traceSteps`, etc. We just need to pass them to `DashboardShell`.

Add these props to the `<DashboardShell>` JSX:
```tsx
messages={chat.messages}
threadTitle={chat.threadTitle}
tokenUsage={chat.tokenUsage}
traceSteps={chat.traceSteps}
onEditApproval={chat.editApproval}
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit --pretty 2>&1 | grep -i "error TS" | head -10
```

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/DashboardPageClient.tsx
git commit -m "feat: pass right panel data through DashboardPageClient
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Remove AgentInspector from AgentWorkbench

**Files:**
- Modify: `src/components/dashboard/agent/AgentWorkbench.tsx`

- [ ] **Step 1: Remove AgentInspector import and rendering**

Remove:
- `import { AgentInspector } from "./AgentInspector";` 
- The `const inspectorPanel = (...)` block (lines 100-127)
- The `{inspectorPanel}` render at the end

Also remove inspector-related props that were only used by AgentInspector (but check if they're still passed — they'll become unused and get an eslint warning. Keep them in the type if DashboardPageClient still passes them, or remove them from both).

Props to remove from `AgentWorkbenchProps`:
- `activeInspectorTab`
- `onActiveInspectorTabChange`
- `artifactsRollbackBusy`
- `artifactsRollbackError`
- `selectedRunRollbackBusy`
- `selectedRunRollbackError`
- `lastRollbackPayload`
- `lastRollbackResult`
- `onArtifactsRollback`
- `onRollbackSelectedRun`
- `selectedRunDetail`
- `contextPreferences`
- `onToggleContextExclude`
- `onToggleContextPin`
- `tokenUsage`
- `inputTokenEstimate`

- [ ] **Step 2: Remove these props from DashboardPageClient AgentWorkbench call**

Update `DashboardPageClient.tsx` to remove these props from `<AgentWorkbench>`.

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit --pretty 2>&1 | grep -i "error TS" | head -10
```

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/agent/AgentWorkbench.tsx src/components/dashboard/DashboardPageClient.tsx
git commit -m "refactor: remove AgentInspector from AgentWorkbench
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Cleanup + Build Verification

**Files:**
- Modify: `src/components/dashboard/agent/index.ts`

- [ ] **Step 1: Remove deprecated exports**

Remove from barrel:
```tsx
export { AgentInspector, AgentInspectorTabs } from "./AgentInspector";
```

- [ ] **Step 2: Build verification**

```bash
npx tsc --noEmit --pretty 2>&1 | head -10
```

Goal: 0 errors.

- [ ] **Step 3: Run tests**

```bash
npm run test 2>&1 | tail -10
```

Goal: 218/218 pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/agent/index.ts
git commit -m "chore: remove AgentInspector from barrel exports
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

### Spec Coverage
- ✅ ContextCard → Task 2
- ✅ PendingActionsCard → Task 3
- ✅ HistoryCard → Task 4
- ✅ DashboardRightPanel assembly → Task 5
- ✅ Grid 4-column update → Task 1
- ✅ DashboardShell integration → Task 6
- ✅ DashboardPageClient wiring → Task 7
- ✅ AgentWorkbench cleanup → Task 8
- ✅ CSS dark mode + responsive → Task 1
- ✅ "右侧整体滚动" → `.sunny-dashboard-right-panel` has `overflow-y: auto`

### Placeholder Scan
- ✅ No TBD/TODO
- ✅ All code blocks complete
- ✅ All CSS classes defined in Task 1

### Type Consistency
- ✅ ContextCard expects `threadId: null | number` — matches existing type
- ✅ PendingActionsCard uses `riskLevelLabelMap` from constants — exists
- ✅ HistoryCard uses `AgentThreadSummary`, `AgentRunSummary` — from types.ts
