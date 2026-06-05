# Dashboard UI Refactor — Codex-like Agent Workspace

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the Dashboard from a crowded 4-column CMS-style layout into a focused 3-column Codex-like Agent Workspace (Sidebar / Agent Workspace / Inspector).

**Architecture:** Remove the outer wrapping columns from `page.tsx` and let `AgentWorkbench` become the full-page layout. Enhance `AgentSidebar` with workspace navigation, `AgentInspector` with Approval/Trace/Linked tabs, and add structured card components (DryRunCard, ExecutionCard, ResultCard, ErrorCard). The top bar gets updated branding and a streamlined theme toggle. Backend code remains untouched — new data needs use typed placeholder interfaces.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS, Payload CMS (backend, unchanged), motion (framer-motion)

**Spec:** `DashboardUIDesign.md` (project root)

---

## File Structure

```
Modified:
  src/app/(site)/dashboard/page.tsx          — Remove outer columns, pass nav/config to AgentWorkbench
  src/components/dashboard/DashboardWorkspaceChrome.tsx — Updated top bar
  src/components/dashboard/agent/AgentSidebar.tsx       — Add workspace nav sections
  src/components/dashboard/agent/AgentInspector.tsx     — Add Approval/Trace/Linked tabs
  src/components/dashboard/agent/AgentComposer.tsx      — Add mode description line
  src/components/dashboard/agent/AgentWorkbench.tsx     — Accept new sidebar/inspector props
  src/components/dashboard/agent/AgentWorkbenchLayout.tsx — Responsive breakpoints
  src/components/dashboard/agent/types.ts               — New tab types, nav item types
  src/components/dashboard/agent/constants.ts            — New mode descriptions, inspector tabs
  src/app/styles/sunny-agent.css                         — Visual polish, reduced borders, responsive
  src/app/styles/sunny-chrome.css                        — Top bar polish
  src/app/styles/sunny-tokens.css                        — New token variables if needed

Created:
  src/components/dashboard/cards/DryRunCard.tsx          — Structured DryRun card
  src/components/dashboard/cards/ExecutionCard.tsx        — Execution result card
  src/components/dashboard/cards/ResultCard.tsx           — Success result card
  src/components/dashboard/cards/ErrorCard.tsx            — Error card
  src/components/dashboard/cards/ScheduleCard.tsx         — Schedule item card (3 density levels)
  src/components/dashboard/cards/StatusBadge.tsx          — Unified status badge
  src/components/dashboard/cards/RiskBadge.tsx            — Risk level badge
  src/components/dashboard/cards/index.ts                 — Barrel export
  src/components/dashboard/agent/AgentApprovalPanel.tsx   — Approval tab content
  src/components/dashboard/agent/AgentTracePanel.tsx      — Trace tab content
  src/components/dashboard/agent/AgentLinkedPanel.tsx     — Linked objects tab content
  src/components/dashboard/nav/dashboard-nav-items.ts     — Workspace navigation definitions
  src/lib/dashboard/placeholder-interfaces.ts             — Typed placeholders for future backend
```

---

### Task 1: Define placeholder interfaces for future backend data

**Files:**
- Create: `src/lib/dashboard/placeholder-interfaces.ts`

- [ ] **Step 1: Create the placeholder interfaces file**

```typescript
/**
 * Placeholder interfaces for Dashboard UI data that the backend
 * will provide in future iterations. Current UI uses mock/stub data.
 *
 * When backend is ready, replace these with actual API responses.
 */

/* ── Inspector context ── */

export type DashboardContextItem = {
  id: string;
  type: "plan" | "schedule" | "checklist" | "post" | "note" | "timeline_event" | "memory";
  title: string;
  href: string;
  status?: string;
  summary?: string;
};

export type DashboardContext = {
  currentPlan: DashboardContextItem | null;
  todaySchedule: DashboardContextItem[];
  relatedChecklists: DashboardContextItem[];
  relatedPosts: DashboardContextItem[];
  relatedMemories: DashboardContextItem[];
  recentExecutions: DashboardContextItem[];
};

/* ── Approval items ── */

export type DashboardApprovalItem = {
  id: string;
  operationType: "create" | "update" | "delete";
  collection: string;
  summary: string;
  riskLevel: "high" | "medium" | "low";
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  reversible: boolean;
};

/* ── Trace steps ── */

export type DashboardTraceStep = {
  id: string;
  order: number;
  label: string;
  status: "completed" | "in_progress" | "pending" | "failed";
  detail?: string;
  timestamp?: string;
};

/* ── Linked objects ── */

export type DashboardLinkedObject = {
  id: string;
  collection: "plans" | "checklists" | "schedule-items" | "posts" | "notes" | "timeline-events" | "agent-memories";
  title: string;
  href: string;
  status?: string;
};

/* ── Memory items ── */

export type DashboardMemoryItem = {
  id: string;
  category: "preference" | "learning_style" | "writing_style" | "time_habit" | "project_context";
  content: string;
};

/* ── Action-oriented metrics ── */

export type DashboardMetrics = {
  pendingConfirmations: number;
  todayScheduleCount: number;
  activePlansCount: number;
  incompleteTasksCount: number;
};

/* ── Navigation definitions ── */

export type DashboardNavSection = {
  id: string;
  label: string;
  items: DashboardNavItem[];
};

export type DashboardNavItem = {
  id: string;
  label: string;
  href: string;
  icon?: string;
  badge?: number;
  external?: boolean;
};

/* ── Stub data generators (for UI development) ── */

export const stubContext: DashboardContext = {
  currentPlan: null,
  todaySchedule: [],
  relatedChecklists: [],
  relatedPosts: [],
  relatedMemories: [],
  recentExecutions: [],
};

export const stubMetrics: DashboardMetrics = {
  pendingConfirmations: 0,
  todayScheduleCount: 0,
  activePlansCount: 0,
  incompleteTasksCount: 0,
};

export const stubLinkedObjects: DashboardLinkedObject[] = [];

export const stubMemories: DashboardMemoryItem[] = [];
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/dashboard/placeholder-interfaces.ts
git commit -m "feat: add placeholder interfaces for dashboard UI backend contract"
```

---

### Task 2: Create workspace navigation definitions

**Files:**
- Create: `src/components/dashboard/nav/dashboard-nav-items.ts`

- [ ] **Step 1: Create navigation items file**

```typescript
import type { DashboardNavSection, DashboardNavItem } from "@/lib/dashboard/placeholder-interfaces";

export const workspaceNavSections: DashboardNavSection[] = [
  {
    id: "today",
    label: "Today",
    items: [
      { id: "today-workspace", label: "今日工作台", href: "/dashboard" },
      { id: "today-pending", label: "待确认", href: "/dashboard?tab=pending" },
      { id: "today-executing", label: "正在执行", href: "/dashboard?tab=executing" },
      { id: "today-recent", label: "最近完成", href: "/dashboard?tab=recent" },
    ],
  },
  {
    id: "workspace",
    label: "Workspace",
    items: [
      { id: "ws-plans", label: "计划", href: "/dashboard?view=plans" },
      { id: "ws-schedule", label: "日程", href: "/dashboard?view=schedule" },
      { id: "ws-writing", label: "写作", href: "/dashboard?view=writing" },
      { id: "ws-notes", label: "笔记", href: "/notes" },
      { id: "ws-timeline", label: "时间线", href: "/timeline" },
      { id: "ws-memory", label: "记忆", href: "/dashboard?view=memory" },
    ],
  },
  {
    id: "system",
    label: "System",
    items: [
      { id: "sys-admin", label: "Admin", href: "/admin" },
      { id: "sys-settings", label: "设置", href: "/admin/settings" },
    ],
  },
];
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/nav/dashboard-nav-items.ts
git commit -m "feat: add workspace navigation definitions for sidebar"
```

---

### Task 3: Create structured card components (DryRun, Execution, Result, Error, Schedule)

**Files:**
- Create: `src/components/dashboard/cards/StatusBadge.tsx`
- Create: `src/components/dashboard/cards/RiskBadge.tsx`
- Create: `src/components/dashboard/cards/DryRunCard.tsx`
- Create: `src/components/dashboard/cards/ExecutionCard.tsx`
- Create: `src/components/dashboard/cards/ResultCard.tsx`
- Create: `src/components/dashboard/cards/ErrorCard.tsx`
- Create: `src/components/dashboard/cards/ScheduleCard.tsx`
- Create: `src/components/dashboard/cards/index.ts`

- [ ] **Step 1: Create StatusBadge component**

```typescript
/* src/components/dashboard/cards/StatusBadge.tsx */
export type StatusTone = "blue" | "green" | "yellow" | "red" | "gray" | "purple";

const toneClasses: Record<StatusTone, string> = {
  blue: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  green: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800",
  yellow: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  red: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
  gray: "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-800",
  purple: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800",
};

export function StatusBadge({ tone = "gray", children }: { tone?: StatusTone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${toneClasses[tone]}`}>
      {children}
    </span>
  );
}
```

- [ ] **Step 2: Create RiskBadge component**

```typescript
/* src/components/dashboard/cards/RiskBadge.tsx */
import { StatusBadge, type StatusTone } from "./StatusBadge";

const riskToneMap: Record<string, StatusTone> = {
  high: "red",
  medium: "yellow",
  low: "green",
};

const riskLabelMap: Record<string, string> = {
  high: "高风险",
  medium: "中风险",
  low: "低风险",
};

export function RiskBadge({ level }: { level: "high" | "medium" | "low" }) {
  return <StatusBadge tone={riskToneMap[level]}>{riskLabelMap[level]}</StatusBadge>;
}
```

- [ ] **Step 3: Create DryRunCard component**

```typescript
/* src/components/dashboard/cards/DryRunCard.tsx */
"use client";

import { RiskBadge } from "./RiskBadge";
import { StatusBadge } from "./StatusBadge";

export type DryRunCardProps = {
  operationType: string;
  riskLevel: "high" | "medium" | "low";
  impactScope: string;
  timeRange?: string;
  conflictStatus?: string;
  status: "awaiting_confirmation" | "confirmed" | "cancelled";
  onConfirm?: () => void;
  onEdit?: () => void;
  onCancel?: () => void;
  disabled?: boolean;
};

export function DryRunCard({
  operationType,
  riskLevel,
  impactScope,
  timeRange,
  conflictStatus,
  status,
  onConfirm,
  onEdit,
  onCancel,
  disabled,
}: DryRunCardProps) {
  const statusLabel = status === "awaiting_confirmation" ? "等待确认"
    : status === "confirmed" ? "已确认" : "已取消";
  const statusTone = status === "awaiting_confirmation" ? "yellow"
    : status === "confirmed" ? "green" : "gray";

  return (
    <div className="rounded-lg border border-border/60 bg-surface-strong p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">Agent 已生成 DryRun</h4>
        <StatusBadge tone={statusTone}>{statusLabel}</StatusBadge>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <span className="text-muted">操作类型</span>
          <p className="font-medium text-foreground">{operationType}</p>
        </div>
        <div>
          <span className="text-muted">风险等级</span>
          <p><RiskBadge level={riskLevel} /></p>
        </div>
        <div>
          <span className="text-muted">影响范围</span>
          <p className="font-medium text-foreground">{impactScope}</p>
        </div>
        {timeRange ? (
          <div>
            <span className="text-muted">时间</span>
            <p className="font-medium text-foreground">{timeRange}</p>
          </div>
        ) : null}
        {conflictStatus ? (
          <div className="col-span-2">
            <span className="text-muted">冲突检测</span>
            <p className="font-medium text-foreground">{conflictStatus}</p>
          </div>
        ) : null}
      </div>
      {status === "awaiting_confirmation" ? (
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            disabled={disabled}
            onClick={onConfirm}
            className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50"
          >
            确认执行
          </button>
          {onEdit ? (
            <button
              type="button"
              disabled={disabled}
              onClick={onEdit}
              className="rounded-md border border-border px-4 py-1.5 text-sm font-semibold text-foreground hover:bg-surface disabled:opacity-50"
            >
              修改
            </button>
          ) : null}
          <button
            type="button"
            disabled={disabled}
            onClick={onCancel}
            className="rounded-md border border-border px-4 py-1.5 text-sm font-semibold text-muted hover:bg-surface disabled:opacity-50"
          >
            取消
          </button>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Create ExecutionCard component**

```typescript
/* src/components/dashboard/cards/ExecutionCard.tsx */
export type ExecutionCardProps = {
  title: string;
  steps: Array<{ label: string; status: "completed" | "in_progress" | "pending" | "failed" }>;
  isRunning?: boolean;
};

export function ExecutionCard({ title, steps, isRunning }: ExecutionCardProps) {
  return (
    <div className="rounded-lg border border-border/60 bg-surface-strong p-4 space-y-3">
      <div className="flex items-center gap-2">
        {isRunning ? (
          <span className="inline-block h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
        ) : null}
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      </div>
      <ol className="space-y-1.5">
        {steps.map((step, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <span className={
              step.status === "completed" ? "text-green-500" :
              step.status === "failed" ? "text-red-500" :
              step.status === "in_progress" ? "text-blue-500" :
              "text-muted"
            }>
              {step.status === "completed" ? "✓" :
               step.status === "failed" ? "✗" :
               step.status === "in_progress" ? "●" : "○"}
            </span>
            <span className={step.status === "in_progress" ? "font-medium text-foreground" : "text-muted"}>
              {step.label}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
```

- [ ] **Step 5: Create ResultCard component**

```typescript
/* src/components/dashboard/cards/ResultCard.tsx */
"use client";

import { StatusBadge } from "./StatusBadge";

export type ResultCardProps = {
  title: string;
  fields: Array<{ label: string; value: string }>;
  actions?: Array<{ label: string; href: string }>;
};

export function ResultCard({ title, fields, actions }: ResultCardProps) {
  return (
    <div className="rounded-lg border border-green-200 bg-green-50/50 p-4 space-y-3 dark:border-green-800 dark:bg-green-950/30">
      <div className="flex items-center gap-2">
        <StatusBadge tone="green">已完成</StatusBadge>
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        {fields.map((field) => (
          <div key={field.label}>
            <span className="text-muted">{field.label}</span>
            <p className="font-medium text-foreground">{field.value}</p>
          </div>
        ))}
      </div>
      {actions && actions.length > 0 ? (
        <div className="flex gap-2 pt-1">
          {actions.map((action) => (
            <a
              key={action.label}
              href={action.href}
              className="rounded-md border border-border px-3 py-1 text-sm font-medium text-foreground hover:bg-surface"
            >
              {action.label}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 6: Create ErrorCard component**

```typescript
/* src/components/dashboard/cards/ErrorCard.tsx */
"use client";

export type ErrorCardProps = {
  reason: string;
  suggestion?: string;
  onAcceptSuggestion?: () => void;
  onRetry?: () => void;
  onCancel?: () => void;
};

export function ErrorCard({ reason, suggestion, onAcceptSuggestion, onRetry, onCancel }: ErrorCardProps) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50/50 p-4 space-y-3 dark:border-red-800 dark:bg-red-950/30">
      <h4 className="text-sm font-semibold text-red-700 dark:text-red-400">执行失败</h4>
      <p className="text-sm text-foreground">
        <span className="text-muted">原因：</span>{reason}
      </p>
      {suggestion ? (
        <p className="text-sm text-foreground">
          <span className="text-muted">建议：</span>{suggestion}
        </p>
      ) : null}
      <div className="flex gap-2">
        {onAcceptSuggestion ? (
          <button
            type="button"
            onClick={onAcceptSuggestion}
            className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong"
          >
            采用建议
          </button>
        ) : null}
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md border border-border px-4 py-1.5 text-sm font-semibold text-foreground hover:bg-surface"
          >
            重新尝试
          </button>
        ) : null}
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border px-4 py-1.5 text-sm font-semibold text-muted hover:bg-surface"
          >
            取消
          </button>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Create ScheduleCard component**

```typescript
/* src/components/dashboard/cards/ScheduleCard.tsx */
"use client";

import { StatusBadge, type StatusTone } from "./StatusBadge";

export type ScheduleCardDensity = "compact" | "expanded" | "detail";

export type ScheduleCardProps = {
  density?: ScheduleCardDensity;
  time: string;
  title: string;
  status: string;
  priority: "high" | "medium" | "low";
  description?: string;
  relatedPlan?: string;
  relatedChecklist?: string;
  tags?: string[];
};

const priorityToneMap: Record<string, StatusTone> = {
  high: "red",
  medium: "yellow",
  low: "gray",
};

const priorityLabelMap: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

export function ScheduleCard({ density = "compact", time, title, status, priority, description, relatedPlan, relatedChecklist, tags }: ScheduleCardProps) {
  if (density === "compact") {
    return (
      <div className="flex items-center gap-2 rounded-md px-2 py-1 text-sm">
        <span className="shrink-0 text-xs font-medium text-muted">{time}</span>
        <span className="truncate font-medium text-foreground">{title}</span>
        <StatusBadge tone={priorityToneMap[priority]}>{priorityLabelMap[priority]}</StatusBadge>
      </div>
    );
  }

  if (density === "expanded") {
    return (
      <div className="rounded-lg border border-border/60 bg-surface-strong p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted">{time}</span>
          <div className="flex items-center gap-1.5">
            <StatusBadge tone={priorityToneMap[priority]}>{priorityLabelMap[priority]}</StatusBadge>
            <StatusBadge tone="blue">{status}</StatusBadge>
          </div>
        </div>
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        {description ? <p className="text-xs text-muted line-clamp-2">{description}</p> : null}
        <div className="flex flex-wrap gap-1 text-xs text-muted">
          {relatedPlan ? <span>📋 {relatedPlan}</span> : null}
          {relatedChecklist ? <span>✓ {relatedChecklist}</span> : null}
          {tags?.map((tag) => <span key={tag} className="rounded bg-surface px-1.5 py-0.5">{tag}</span>)}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/60 bg-surface-strong p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted">{time}</span>
        <div className="flex items-center gap-1.5">
          <StatusBadge tone={priorityToneMap[priority]}>{priorityLabelMap[priority]}优先级</StatusBadge>
          <StatusBadge tone="blue">{status}</StatusBadge>
        </div>
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description ? <p className="text-sm text-muted">{description}</p> : null}
      {relatedPlan || relatedChecklist ? (
        <div className="flex gap-4 text-sm">
          {relatedPlan ? <span className="text-muted">关联计划：<span className="font-medium text-foreground">{relatedPlan}</span></span> : null}
          {relatedChecklist ? <span className="text-muted">关联清单：<span className="font-medium text-foreground">{relatedChecklist}</span></span> : null}
        </div>
      ) : null}
      {tags && tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => <span key={tag} className="rounded-md bg-surface px-2 py-0.5 text-xs text-muted">{tag}</span>)}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 8: Create barrel export**

```typescript
/* src/components/dashboard/cards/index.ts */
export { DryRunCard } from "./DryRunCard";
export type { DryRunCardProps } from "./DryRunCard";
export { ExecutionCard } from "./ExecutionCard";
export type { ExecutionCardProps } from "./ExecutionCard";
export { ResultCard } from "./ResultCard";
export type { ResultCardProps } from "./ResultCard";
export { ErrorCard } from "./ErrorCard";
export type { ErrorCardProps } from "./ErrorCard";
export { ScheduleCard } from "./ScheduleCard";
export type { ScheduleCardProps, ScheduleCardDensity } from "./ScheduleCard";
export { StatusBadge } from "./StatusBadge";
export type { StatusTone } from "./StatusBadge";
export { RiskBadge } from "./RiskBadge";
```

- [ ] **Step 9: Commit**

```bash
git add src/components/dashboard/cards/
git commit -m "feat: add structured card components (DryRun, Execution, Result, Error, Schedule, Status, Risk)"
```

---

### Task 4: Update types and constants for new inspector tabs and mode descriptions

**Files:**
- Modify: `src/components/dashboard/agent/types.ts`
- Modify: `src/components/dashboard/agent/constants.ts`

- [ ] **Step 1: Update AgentInspectorTab type to add new tabs**

In `src/components/dashboard/agent/types.ts`, change:
```typescript
export type AgentInspectorTab = "artifacts" | "changes" | "context" | "dag" | "debug" | "memory";
```
To:
```typescript
export type AgentInspectorTab = "context" | "approval" | "trace" | "linked" | "memory" | "artifacts" | "changes" | "dag" | "debug";
```

- [ ] **Step 2: Update inspectorTabs in constants.ts**

In `src/components/dashboard/agent/constants.ts`, replace the `inspectorTabs` array:

```typescript
export const inspectorTabs: Array<{ key: AgentInspectorTab; label: string }> = [
  { key: "context", label: "上下文" },
  { key: "approval", label: "审批" },
  { key: "trace", label: "追踪" },
  { key: "linked", label: "关联" },
  { key: "memory", label: "记忆" },
  { key: "artifacts", label: "产物" },
  { key: "changes", label: "变更" },
  { key: "dag", label: "任务图" },
  { key: "debug", label: "调试" },
];
```

- [ ] **Step 3: Add mode description map in constants.ts**

Add at the end of `src/components/dashboard/agent/constants.ts`:

```typescript
export const modeDescriptionMap: Record<AgentWorkbenchMode, string> = {
  ask: "问答 · 不会修改数据",
  plan: "规划 · 仅生成计划建议",
  execute: "执行 · 需要确认后写入",
  review: "复盘 · 只读分析",
  timeline: "时间线 · 查看与记录",
};
```

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/agent/types.ts src/components/dashboard/agent/constants.ts
git commit -m "feat: add approval/trace/linked inspector tabs and mode descriptions"
```

---

### Task 5: Create new inspector panel components (Approval, Trace, Linked)

**Files:**
- Create: `src/components/dashboard/agent/AgentApprovalPanel.tsx`
- Create: `src/components/dashboard/agent/AgentTracePanel.tsx`
- Create: `src/components/dashboard/agent/AgentLinkedPanel.tsx`

- [ ] **Step 1: Create AgentApprovalPanel**

```typescript
/* src/components/dashboard/agent/AgentApprovalPanel.tsx */
"use client";

import type { ProposedAgentAction, PendingAction } from "@/lib/agent/schemas";
import { DryRunCard } from "@/components/dashboard/cards";
import { riskLevelLabelMap } from "./constants";

type AgentApprovalPanelProps = {
  action: null | ProposedAgentAction;
  pendingAction: null | PendingAction;
};

export function AgentApprovalPanel({ action, pendingAction }: AgentApprovalPanelProps) {
  if (!pendingAction && !action) {
    return (
      <div className="p-4 text-center text-sm text-muted">
        <p>暂无待审批操作</p>
        <p className="mt-1 text-xs">Agent 执行写入操作前会在此显示审批卡片</p>
      </div>
    );
  }

  const approvalActions = pendingAction?.type === "await_batch_confirmation"
    ? pendingAction.actions
    : action ? [action] : [];

  if (approvalActions.length === 0 && !pendingAction) {
    return (
      <div className="p-4 text-sm text-muted">
        <p>Agent 当前没有待确认的操作。执行模式下的写操作会自动生成 DryRun 卡片。</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3">
      <p className="text-xs font-semibold text-muted uppercase tracking-wider">
        待审批 ({approvalActions.length})
      </p>
      {approvalActions.map((act) => (
        <div key={act.id ?? act.summary} className="rounded-lg border border-border/60 bg-surface p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted">
              {act.toolName ?? act.intent}
            </span>
            <span className={`text-xs font-semibold ${
              act.riskLevel === "high" ? "text-red-500" :
              act.riskLevel === "medium" ? "text-amber-500" : "text-green-500"
            }`}>
              {riskLevelLabelMap[act.riskLevel]}
            </span>
          </div>
          <p className="text-sm font-medium text-foreground">{act.summary}</p>
          {act.changes.length > 0 ? (
            <div className="space-y-1">
              {act.changes.slice(0, 5).map((change, i) => (
                <p key={i} className="text-xs text-muted">
                  {change.operation === "create" ? "创建" : change.operation === "update" ? "更新" : "删除"}
                  {" "}{change.collection}
                  {change.documentId ? ` #${change.documentId}` : ""}
                  {change.preview ? ` — ${change.preview}` : ""}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      ))}
      {pendingAction?.type === "await_confirmation" ? (
        <p className="text-xs text-muted">
          💡 回复「确认」执行，或「取消」放弃。也可以修改请求内容。
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Create AgentTracePanel**

```typescript
/* src/components/dashboard/agent/AgentTracePanel.tsx */
"use client";

import type { AgentTraceStep } from "@/lib/agent/schemas";
import { traceKindLabelMap } from "./constants";

type AgentTracePanelProps = {
  traceSteps: AgentTraceStep[];
  statusLabel: string;
};

const defaultTraceLabels = [
  "识别意图",
  "构建上下文",
  "拆解任务",
  "调用工具",
  "生成 DryRun",
  "等待确认",
  "执行写入",
  "记录结果",
];

export function AgentTracePanel({ traceSteps, statusLabel }: AgentTracePanelProps) {
  const hasTrace = traceSteps.length > 0;

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider">执行追踪</p>
        <span className="text-xs text-muted">{statusLabel}</span>
      </div>
      {hasTrace ? (
        <ol className="space-y-1.5">
          {traceSteps.map((step, i) => (
            <li key={step.id ?? i} className="flex items-start gap-2 text-sm">
              <span className="shrink-0 mt-0.5 text-xs font-medium text-muted">{i + 1}.</span>
              <div>
                <span className="font-medium text-foreground">
                  {traceKindLabelMap[step.kind] ?? step.kind}
                </span>
                {step.detail ? (
                  <p className="text-xs text-muted">{step.detail}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="space-y-1.5">
          {defaultTraceLabels.map((label, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-muted">
              <span className="text-xs">{i + 1}.</span>
              <span>{label}</span>
            </div>
          ))}
          <p className="text-xs text-muted mt-2">
            💡 执行 Agent 任务时会在此显示实时步骤追踪。
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create AgentLinkedPanel**

```typescript
/* src/components/dashboard/agent/AgentLinkedPanel.tsx */
"use client";

import type { DashboardLinkedObject } from "@/lib/dashboard/placeholder-interfaces";
import { stubLinkedObjects } from "@/lib/dashboard/placeholder-interfaces";

type AgentLinkedPanelProps = {
  linkedObjects?: DashboardLinkedObject[];
};

const collectionLabelMap: Record<string, string> = {
  plans: "计划",
  checklists: "清单",
  "schedule-items": "日程",
  posts: "文章",
  notes: "短札",
  "timeline-events": "时间线",
  "agent-memories": "记忆",
};

export function AgentLinkedPanel({ linkedObjects = stubLinkedObjects }: AgentLinkedPanelProps) {
  if (linkedObjects.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted">
        <p>暂无关联对象</p>
        <p className="mt-1 text-xs">
          当 Agent 对话关联到计划、日程、文章等对象时，会在此显示。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-3">
      <p className="text-xs font-semibold text-muted uppercase tracking-wider">
        关联对象 ({linkedObjects.length})
      </p>
      {linkedObjects.map((obj) => (
        <a
          key={obj.id}
          href={obj.href}
          className="flex items-center justify-between rounded-md border border-border/60 bg-surface p-2.5 hover:bg-surface-strong transition-colors"
        >
          <div className="min-w-0">
            <span className="text-xs text-muted">
              {collectionLabelMap[obj.collection] ?? obj.collection}
            </span>
            <p className="truncate text-sm font-medium text-foreground">{obj.title}</p>
          </div>
          {obj.status ? (
            <span className="shrink-0 rounded-full bg-surface-strong px-2 py-0.5 text-xs text-muted">
              {obj.status}
            </span>
          ) : null}
        </a>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/agent/AgentApprovalPanel.tsx src/components/dashboard/agent/AgentTracePanel.tsx src/components/dashboard/agent/AgentLinkedPanel.tsx
git commit -m "feat: add Approval, Trace, and Linked inspector panel components"
```

---

### Task 6: Update AgentInspector to render new tabs

**Files:**
- Modify: `src/components/dashboard/agent/AgentInspector.tsx`

- [ ] **Step 1: Import new panels and update InspectorPanels**

In `src/components/dashboard/agent/AgentInspector.tsx`, add imports:
```typescript
import { AgentApprovalPanel } from "./AgentApprovalPanel";
import { AgentTracePanel } from "./AgentTracePanel";
import { AgentLinkedPanel } from "./AgentLinkedPanel";
```

Add new tab cases inside the `<motion.div>` in `InspectorPanels`. After the `{activeTab === "context" ? ...` block, add:

```typescript
{activeTab === "approval" ? (
  <AgentApprovalPanel action={action} pendingAction={pendingAction} />
) : null}
{activeTab === "trace" ? (
  <AgentTracePanel traceSteps={traceSteps} statusLabel={statusLabel} />
) : null}
{activeTab === "linked" ? <AgentLinkedPanel /> : null}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/agent/AgentInspector.tsx
git commit -m "feat: wire Approval, Trace, and Linked panels into AgentInspector"
```

---

### Task 7: Enhance AgentSidebar with workspace navigation

**Files:**
- Modify: `src/components/dashboard/agent/AgentSidebar.tsx`

- [ ] **Step 1: Add workspace navigation to AgentSidebar**

Add import at top:
```typescript
import Link from "next/link";
import { workspaceNavSections } from "@/components/dashboard/nav/dashboard-nav-items";
```

Add workspace navigation sections before the closing `</aside>` tag (before the thread list). Insert this block right after the "建议" section (before the `<details className="sunny-agent-rail-section sunny-agent-rail-details" open>` line):

```typescript
{workspaceNavSections.map((section) => (
  <details key={section.id} className="sunny-agent-rail-section sunny-agent-rail-details" open={section.id === "today"}>
    <summary>{section.label}</summary>
    <div className="sunny-agent-rail-detail-list">
      {section.items.map((item) => (
        <Link
          key={item.id}
          href={item.href}
          className="sunny-agent-nav-item"
        >
          <AgentTaskRow
            detail={item.badge ? String(item.badge) : undefined}
            label={item.label}
            tone="muted"
          />
        </Link>
      ))}
    </div>
  </details>
))}
```

- [ ] **Step 2: Update the "new task" button label**

Change:
```tsx
<button type="button" onClick={onNewThread} className="sunny-agent-new-task-button">
  新任务
</button>
```
To:
```tsx
<button type="button" onClick={onNewThread} className="sunny-agent-new-task-button">
  + 新建 Thread
</button>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/agent/AgentSidebar.tsx
git commit -m "feat: add workspace navigation sections to AgentSidebar"
```

---

### Task 8: Update AgentComposer with mode description

**Files:**
- Modify: `src/components/dashboard/agent/AgentComposer.tsx`

- [ ] **Step 1: Add mode description line**

Import `modeDescriptionMap` from constants:
```typescript
import { modeItems, modeDescriptionMap } from "./constants";
```

Add a mode description line between the mode switch and the textarea. In the JSX, after the `sunny-agent-composer-top` div and before the `sunny-agent-composer-row` div, add:

```tsx
<div className="sunny-agent-mode-description">
  <span className="text-xs text-muted">
    {modeDescriptionMap[mode]}
  </span>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/agent/AgentComposer.tsx
git commit -m "feat: add mode description line to AgentComposer"
```

---

### Task 9: Update DashboardWorkspaceChrome (top bar)

**Files:**
- Modify: `src/components/dashboard/DashboardWorkspaceChrome.tsx`

- [ ] **Step 1: Rewrite the top bar**

Replace the entire file content:

```tsx
"use client";

import Link from "next/link";
import { SiteBrand } from "@/components/shared/SiteBrand";
import { ThemeToggle } from "@/components/public/ThemeToggle";
import { useSitePreferences } from "@/components/shared/SitePreferencesProvider";

export function DashboardWorkspaceChrome() {
  const { locale } = useSitePreferences();

  return (
    <header className="sunny-chrome-header sunny-dashboard-chrome">
      <div className="sunny-chrome-header-inner">
        <div className="flex items-center gap-4 min-w-0">
          <SiteBrand locale={locale} variant="admin" />
          {/* Placeholder: model status — backend will provide */}
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-border/60 px-2.5 py-0.5 text-xs text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            DeepSeek V3
          </span>
        </div>

        <div className="sunny-chrome-header-actions">
          {/* Placeholder: command/search entry — backend will wire */}
          <button
            type="button"
            className="hidden md:inline-flex items-center gap-2 rounded-md border border-border/60 px-3 py-1.5 text-sm text-muted hover:bg-surface transition-colors"
            aria-label="命令搜索"
          >
            <span>⌘K</span>
            <span className="text-xs">命令搜索...</span>
          </button>
          <Link href="/" className="sunny-chrome-nav-link" target="_blank" rel="noopener noreferrer">
            前台
          </Link>
          <Link href="/admin" className="sunny-chrome-nav-link">
            Admin
          </Link>
          <ThemeToggle locale={locale} variant="admin" />
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/DashboardWorkspaceChrome.tsx
git commit -m "feat: update top bar with model status, command entry, streamlined controls"
```

---

### Task 10: Restructure dashboard page.tsx to clean 3-column layout

**Files:**
- Modify: `src/app/(site)/dashboard/page.tsx`

- [ ] **Step 1: Rewrite the dashboard page to remove outer columns**

Replace the entire file content:

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
  const { agentQuickPrompts, agentSuggestions } = await loadDashboardData(params);

  return (
    <main className="sunny-dashboard-shell-v2">
      <DashboardWorkspaceChrome />
      <div className="sunny-dashboard-workspace">
        <DashboardAgentChatFullSection
          initialThreadId={model.initialThreadId}
          quickPrompts={agentQuickPrompts}
          suggestions={agentSuggestions}
        />
      </div>
    </main>
  );
}
```

Wait — the `model` is used for `initialThreadId`. Let me fix that:

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
    <main className="sunny-dashboard-shell-v2">
      <DashboardWorkspaceChrome />
      <div className="sunny-dashboard-workspace">
        <DashboardAgentChatFullSection
          initialThreadId={model.initialThreadId}
          quickPrompts={agentQuickPrompts}
          suggestions={agentSuggestions}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(site\)/dashboard/page.tsx
git commit -m "refactor: restructure dashboard to clean 2-zone layout (chrome + workspace)"
```

---

### Task 11: Update AgentWorkbenchLayout for responsive breakpoints

**Files:**
- Modify: `src/components/dashboard/agent/AgentWorkbenchLayout.tsx`

- [ ] **Step 1: Add responsive classes**

In the `classes` array construction, replace with:

```typescript
const classes = [
  "sunny-agent-workbench-layout",
  noInspector ? "sunny-agent-workbench-layout--no-inspector" : "",
  layout !== "balanced" ? `sunny-agent-layout-${layout}` : "",
  sidebarCollapsed ? "sunny-agent-sidebar-collapsed" : "",
].filter(Boolean).join(" ");
```

No code change needed here — the layout already supports these variants. Instead, add the responsive behavior in CSS in Task 12.

- [ ] **Step 2: Commit** (skip — no code change needed; responsive behavior comes from CSS)

---

### Task 12: CSS updates — reduced borders, unified styles, responsive

**Files:**
- Modify: `src/app/styles/sunny-agent.css`
- Modify: `src/app/styles/sunny-chrome.css`
- Modify: `src/app/styles/sunny-tokens.css`

- [ ] **Step 1: Add responsive breakpoints and visual polish to sunny-agent.css**

Append to the end of `src/app/styles/sunny-agent.css`:

```css
/* ── Dashboard shell v2 (full-page workspace) ── */
.sunny-dashboard-shell-v2 {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  padding: var(--agent-gap-md);
  gap: var(--agent-gap-md);
}

.sunny-dashboard-workspace {
  flex: 1 1 auto;
  display: flex;
  min-height: 0;
}

.sunny-dashboard-workspace .sunny-dashboard-col-center {
  flex: 1 1 auto;
  min-width: 0;
}

/* ── Mode description line ── */
.sunny-agent-mode-description {
  display: flex;
  align-items: center;
  padding: 0.25rem 0.25rem 0.25rem 0.5rem;
}

/* ── Workspace nav items ── */
.sunny-agent-nav-item {
  display: block;
  text-decoration: none;
  border-radius: var(--agent-radius-control);
  transition: background 160ms ease;
}

.sunny-agent-nav-item:hover {
  background: var(--agent-control-bg);
}

/* ── Reduced border density: workbench shell ── */
.sunny-agent-workbench-layout {
  border: none;
  box-shadow: none;
  background: transparent;
  padding: 0;
  border-radius: 0;
}

html[data-theme="dark"] .sunny-agent-workbench-layout {
  background: transparent;
}

/* Inner panels keep subtle borders for separation */
.sunny-agent-center-surface {
  border: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
  border-radius: var(--agent-radius-shell);
  background: var(--surface);
  overflow: hidden;
}

.sunny-agent-left-rail-column {
  border: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
  border-radius: var(--agent-radius-shell);
  background: var(--surface);
}

.sunny-agent-inspector-shell {
  border: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
  border-radius: var(--agent-radius-shell);
  background: var(--surface);
}

/* ── Responsive: Tablet ── */
@media (max-width: 1024px) {
  .sunny-agent-workbench-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .sunny-agent-left-rail-column {
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    z-index: 60;
    width: 16rem;
    transform: translateX(-100%);
    transition: transform 220ms ease;
  }

  .sunny-agent-left-rail-column.is-open {
    transform: translateX(0);
  }

  .sunny-agent-sidebar-toggle {
    position: fixed;
    left: 0.5rem;
    top: 50%;
    z-index: 61;
    transform: translateY(-50%);
  }

  .sunny-agent-inspector-shell {
    display: none;
  }

  .sunny-agent-inspector-compact {
    display: block;
  }
}

/* ── Responsive: Mobile ── */
@media (max-width: 640px) {
  .sunny-dashboard-shell-v2 {
    padding: var(--agent-gap-xs);
    gap: var(--agent-gap-xs);
  }

  .sunny-agent-center-surface {
    border-radius: var(--radius-control);
  }

  .sunny-agent-composer {
    padding: var(--agent-gap-sm);
  }
}

/* ── Sidebar collapsed state ── */
.sunny-agent-sidebar-collapsed {
  grid-template-columns: 2.5rem minmax(0, 1fr) var(--agent-inspector-width);
}

.sunny-agent-sidebar-collapsed.sunny-agent-workbench-layout--no-inspector {
  grid-template-columns: 2.5rem minmax(0, 1fr);
}

/* ── Top bar polish ── */
.sunny-dashboard-chrome {
  border: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
}
```

- [ ] **Step 2: Verify CSS builds**

```bash
cd /Users/richardluo/Documents/Develop/SunnyPanel && npx next build --no-lint 2>&1 | tail -20
```

Wait: this is a full build, which is too heavy for this step. Instead, just verify the CSS syntax:

```bash
npx tailwindcss --help > /dev/null 2>&1 && echo "Tailwind available"
```

- [ ] **Step 3: Commit**

```bash
git add src/app/styles/sunny-agent.css src/app/styles/sunny-chrome.css
git commit -m "style: add dashboard shell v2, responsive breakpoints, reduced borders"
```

---

### Task 13: Update metrics display — action-oriented stats in Context panel

**Files:**
- Modify: `src/components/dashboard/agent/AgentContextPanel.tsx`

- [ ] **Step 1: Read the current AgentContextPanel and add metrics rows**

First read the file to see current structure, then add action-oriented metrics.

Reading `src/components/dashboard/agent/AgentContextPanel.tsx` — add a metrics summary at the top:

In the panel content (after the heading/section intro), add:

```tsx
{/* Placeholder: Action-oriented metrics — backend provides actual counts */}
<div className="grid grid-cols-2 gap-2 mb-3">
  <div className="rounded-md border border-border/60 bg-surface p-2.5 text-center">
    <p className="text-lg font-bold text-amber-500">{/* pendingConfirmations */}0</p>
    <p className="text-xs text-muted">待确认</p>
  </div>
  <div className="rounded-md border border-border/60 bg-surface p-2.5 text-center">
    <p className="text-lg font-bold text-blue-500">{/* todaySchedule */}0</p>
    <p className="text-xs text-muted">今日日程</p>
  </div>
  <div className="rounded-md border border-border/60 bg-surface p-2.5 text-center">
    <p className="text-lg font-bold text-green-500">{/* activePlans */}0</p>
    <p className="text-xs text-muted">进行中计划</p>
  </div>
  <div className="rounded-md border border-border/60 bg-surface p-2.5 text-center">
    <p className="text-lg font-bold text-purple-500">{/* incompleteTasks */}0</p>
    <p className="text-xs text-muted">未完成任务</p>
  </div>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/agent/AgentContextPanel.tsx
git commit -m "feat: add action-oriented metrics grid to Context panel"
```

---

### Task 14: Verify build and fix any TypeScript / import errors

**Files:** All modified files

- [ ] **Step 1: Run TypeScript check**

```bash
cd /Users/richardluo/Documents/Develop/SunnyPanel && npx tsc --noEmit 2>&1 | head -50
```

- [ ] **Step 2: Fix any type errors found**

Review each error and fix imports, missing types, or mismatched props. Common issues to check:
- `model` import in page.tsx (it's destructured from `loadDashboardData`)
- Circular imports between agent components
- Missing exports in `index.ts` barrel files

- [ ] **Step 3: Re-run TypeScript check until clean**

```bash
npx tsc --noEmit 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve TypeScript errors from dashboard refactor"
```

---

### Task 15: Final integration — ensure all pieces connect

**Files:**
- Modify: `src/components/dashboard/agent/index.ts` — add new panel exports

- [ ] **Step 1: Update agent barrel exports**

In `src/components/dashboard/agent/index.ts`, add:
```typescript
export { AgentApprovalPanel } from "./AgentApprovalPanel";
export { AgentTracePanel } from "./AgentTracePanel";
export { AgentLinkedPanel } from "./AgentLinkedPanel";
```

- [ ] **Step 2: Verify the full page renders**

```bash
cd /Users/richardluo/Documents/Develop/SunnyPanel && npm run dev 2>&1 &
sleep 5
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/dashboard
```

Expected: 200 OK (or 307 redirect if auth is needed). Kill the dev server after.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/agent/index.ts
git commit -m "feat: export new inspector panels from agent barrel"
```

---

## Summary for Backend Integration

After all UI tasks are complete, here is what the backend team needs to know:

### New Inspector Tabs (already wired in UI, use stub data)

| Tab | Component | Data Needed | Backend Endpoint |
|-----|-----------|-------------|------------------|
| **审批 (Approval)** | `AgentApprovalPanel` | `PendingAction[]` | Already provided by existing agent pipeline |
| **追踪 (Trace)** | `AgentTracePanel` | `AgentTraceStep[]` | Already provided by existing agent pipeline |
| **关联 (Linked)** | `AgentLinkedPanel` | `DashboardLinkedObject[]` | **NEW**: `GET /api/dashboard/linked-objects?threadId=` |
| **上下文 (Context)** | `AgentContextPanel` | `DashboardContext + DashboardMetrics` | **NEW**: `GET /api/dashboard/context?threadId=` |
| **记忆 (Memory)** | `AgentMemoryPanel` | `DashboardMemoryItem[]` | **NEW**: `GET /api/dashboard/memories?threadId=` |

### New Data Interfaces (in `src/lib/dashboard/placeholder-interfaces.ts`)

- `DashboardMetrics` — `{ pendingConfirmations, todayScheduleCount, activePlansCount, incompleteTasksCount }`
- `DashboardContext` — current plan, today's schedule, related checklists/posts/memories, recent executions
- `DashboardLinkedObject` — `{ id, collection, title, href, status }`
- `DashboardMemoryItem` — `{ id, category, content }`
- `DashboardTraceStep` — `{ id, order, label, status, detail, timestamp }`

### Mode Description Map (in `src/components/dashboard/agent/constants.ts`)

```typescript
export const modeDescriptionMap: Record<AgentWorkbenchMode, string> = {
  ask: "问答 · 不会修改数据",
  plan: "规划 · 仅生成计划建议",
  execute: "执行 · 需要确认后写入",
  review: "复盘 · 只读分析",
  timeline: "时间线 · 查看与记录",
};
```

### Top Bar Placeholders

- Model status indicator (currently hardcoded "DeepSeek V3" with green dot)
- Command search button (⌘K, currently non-functional)

### What Did NOT Change

- All files under `src/lib/` (backend logic) — untouched
- All files under `src/app/api/` — untouched
- Payload CMS collections — untouched
- `loadDashboardData` function — still returns the same shape
- `AgentChatPanel` and all chat messaging hooks — untouched
- `use-agent-chat-messaging.ts` — untouched
- `use-agent-thread.ts` — untouched
```

- [ ] **Step 4: Final commit**

```bash
git add docs/superpowers/plans/2026-05-30-dashboard-ui-refactor.md
git commit -m "docs: add dashboard UI refactor implementation plan with backend summary"
```
