# Dashboard 模式切换差异化上下文 —— 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Dashboard 6 种工作模式从「仅发送预设 prompt」升级为：agent/today/plans/writing 自动注入差异化上下文，schedule 切换月历视图，memory 切换记忆卡片网格。

**Architecture:** 扩展 `AgentWorkbenchMode` 增加 `today`/`writing`；在 `DashboardShell` 中按 `activeMode`（`DashboardIconMode`）路由到 `ScheduleMonthView`/`MemoryCardGrid` 或现有 `AgentWorkbench`；后端 `build-context-step` 按模式加载专属数据；新增 schedule/memory 查询 API。

**Tech Stack:** Next.js 16 (App Router), React 19, Payload CMS, TypeScript, SSE streaming

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/lib/agent/workbench-mode.ts` | 修改 | 扩展类型增加 `today` `writing` |
| `src/lib/agent/context-builder.ts` | 修改 | `applyWorkbenchModeBudget` 支持新模式 |
| `src/lib/agent/chat-pipeline/build-context-step.ts` | 修改 | 按模式加载差异化上下文，返回 contextSummary |
| `src/lib/agent/chat-pipeline/handle-agent-chat-post.ts` | 修改 | parseWorkbenchMode 支持新值 |
| `src/lib/agent/chat-pipeline/stream-envelope.ts` | 修改 | intentToSuggestedMode 增加映射 |
| `src/components/dashboard/DashboardShell.tsx` | 修改 | 按 activeMode 路由视图 |
| `src/components/dashboard/DashboardPageClient.tsx` | 修改 | 传递 activeMode prop |
| `src/components/dashboard/schedule/ScheduleMonthView.tsx` | 新建 | 月历视图组件 |
| `src/components/dashboard/memory/MemoryCardGrid.tsx` | 新建 | 记忆卡片网格组件 |
| `src/components/dashboard/agent/AgentContextPanel.tsx` | 修改 | 增加模式标签 badge |
| `src/components/dashboard/DashboardStatusBar.tsx` | 修改 | 接收 contextSummary |
| `src/app/api/agent/schedule/route.ts` | 新建 | 日程查询 API |
| `src/app/api/agent/memory/route.ts` | 新建 | 记忆查询 API |
| `src/app/styles/sunny-dashboard-schedule.css` | 新建 | 月历视图样式 |
| `src/app/styles/sunny-dashboard-memory.css` | 新建 | 记忆卡片样式 |
| `src/app/styles/sunny-agent.css` | 修改 | 模式 badge 样式 |
| `src/app/styles/sunny-dashboard-shell.css` | 修改 | 导入新样式文件 |
| `src/components/dashboard/DashboardRightPanel.tsx` | 修改 | modeLabelMap 增加新模式 |

---

### Task 1: 扩展 AgentWorkbenchMode 类型

**Files:**
- Modify: `src/lib/agent/workbench-mode.ts`
- Modify: `src/lib/agent/context-builder.ts:653-678`
- Modify: `src/lib/agent/chat-pipeline/handle-agent-chat-post.ts:46-48`
- Modify: `src/lib/agent/chat-pipeline/stream-envelope.ts:13-31`
- Modify: `src/components/dashboard/DashboardRightPanel.tsx:45-52`

- [ ] **Step 1: 扩展 workbench-mode 类型定义**

```typescript
// src/lib/agent/workbench-mode.ts
/** Dashboard Agent 工作台模式；与 UI 对齐并传入 chat API。 */
export type AgentWorkbenchMode = "answer" | "ask" | "execute" | "plan" | "review" | "timeline" | "today" | "writing";
```

- [ ] **Step 2: 更新 applyWorkbenchModeBudget 支持新模式**

在 `src/lib/agent/context-builder.ts:653-678` 的 `applyWorkbenchModeBudget` 函数 switch 中增加两个 case：

```typescript
const applyWorkbenchModeBudget = (
  budget: AgentContextBudget,
  workbenchMode: AgentWorkbenchMode | null,
): AgentContextBudget => {
  switch (workbenchMode) {
    case "timeline":
      return { ...budget, maxTimelineEvents: Math.min(48, budget.maxTimelineEvents + 8) };
    case "plan":
    case "execute":
      return { ...budget, maxPlanReviews: Math.min(12, budget.maxPlanReviews + 3), maxPlans: Math.min(24, budget.maxPlans + 4) };
    case "review":
      return { ...budget, maxAgentRuns: Math.min(12, budget.maxAgentRuns + 4), maxPlanReviews: Math.min(12, budget.maxPlanReviews + 4) };
    case "today":
      return { ...budget, maxPlans: Math.min(24, budget.maxPlans + 4), maxTimelineEvents: Math.min(16, budget.maxTimelineEvents + 4) };
    case "writing":
      return { ...budget, maxContentItems: Math.min(24, budget.maxContentItems + 8) };
    default:
      return budget;
  }
};
```

同时更新 `buildAgentContext` 中 mode 推算逻辑（约 L733-742），在现有分支后增加：

```typescript
const mode =
  workbenchMode === "plan" || workbenchMode === "execute"
    ? "planning"
    : workbenchMode === "review"
      ? "review"
      : workbenchMode === "timeline"
        ? "timeline"
        : workbenchMode === "today"
          ? "progress"  // today 模式偏向进度视角
          : workbenchMode === "writing"
            ? "content"  // writing 模式偏向内容视角
            : workbenchMode === "ask" || workbenchMode === "answer"
              ? "general"
              : inferredMode;
```

- [ ] **Step 3: 更新 parseWorkbenchMode 白名单**

在 `src/lib/agent/chat-pipeline/handle-agent-chat-post.ts:46` 的 `WORKBENCH_MODES` 数组中增加新值：

```typescript
const WORKBENCH_MODES = ["answer", "ask", "execute", "plan", "review", "timeline", "today", "writing"] as const satisfies readonly AgentWorkbenchMode[];
```

- [ ] **Step 4: 更新 intentToSuggestedMode 映射**

在 `src/lib/agent/chat-pipeline/stream-envelope.ts:13-31` 的 `intentToSuggestedMode` 末尾增加：

```typescript
const intentToSuggestedMode: Partial<Record<AgentChatResponse["intent"], AgentWorkbenchMode>> = {
  // ... 现有映射保持不变 ...
  query_progress: "today",
  query_plan_progress: "today",
  compose_plan: "plan",
  compose_schedule_item: "today",
};
```

- [ ] **Step 5: 更新 DashboardRightPanel modeLabelMap**

在 `src/components/dashboard/DashboardRightPanel.tsx:45-52` 的 `modeLabelMap` 增加两项：

```typescript
const modeLabelMap: Record<AgentWorkbenchMode, string> = {
  ask: "自动模式",
  answer: "只回答",
  execute: "执行模式",
  plan: "规划模式",
  review: "回顾模式",
  timeline: "时间线模式",
  today: "今日模式",
  writing: "写作模式",
};
```

- [ ] **Step 6: 验证 TypeScript 编译**

```bash
npx tsc --noEmit --pretty 2>&1 | head -40
```

Expected: 无新增类型错误（与 `AgentWorkbenchMode` 相关的类型错误应全部消除）。

- [ ] **Step 7: Commit**

```bash
git add src/lib/agent/workbench-mode.ts src/lib/agent/context-builder.ts src/lib/agent/chat-pipeline/handle-agent-chat-post.ts src/lib/agent/chat-pipeline/stream-envelope.ts src/components/dashboard/DashboardRightPanel.tsx
git commit -m "feat: extend AgentWorkbenchMode with today/writing modes

- Add 'today' and 'writing' to AgentWorkbenchMode union
- Update applyWorkbenchModeBudget with today/writing budget rules
- Map today→progress mode, writing→content mode in buildAgentContext
- Add modeLabelMap entries for today and writing
- Update parseWorkbenchMode whitelist

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: 后端 —— 日程查询 API

**Files:**
- Create: `src/app/api/agent/schedule/route.ts`

- [ ] **Step 1: 创建 API 路由**

```typescript
// src/app/api/agent/schedule/route.ts
import { NextResponse } from "next/server";
import { getPayloadAuthResult } from "@/lib/payload/auth";
import { getPayloadClient } from "@/lib/payload/client";

export async function GET(request: Request) {
  const authResult = await getPayloadAuthResult();
  if (!authResult.user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const url = new URL(request.url);
  const monthParam = url.searchParams.get("month"); // "2026-06"

  if (!monthParam || !/^\d{4}-\d{2}$/.test(monthParam)) {
    return NextResponse.json({ message: "需要 month 参数，格式 YYYY-MM" }, { status: 400 });
  }

  const [year, m] = monthParam.split("-").map(Number);
  const monthStart = new Date(Date.UTC(year, m - 1, 1)).toISOString().slice(0, 10);
  const monthEnd = new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10);

  const payload = await getPayloadClient();

  const result = await payload.find({
    collection: "schedule-items",
    depth: 0,
    limit: 200,
    overrideAccess: true,
    sort: "date",
    where: {
      and: [
        { date: { greater_than_equal: monthStart } },
        { date: { less_than_equal: monthEnd } },
      ],
    },
  });

  const items = result.docs.map((doc) => ({
    id: doc.id,
    title: doc.title,
    date: doc.date,
    startTime: doc.startTime ?? null,
    endTime: doc.endTime ?? null,
    status: doc.status,
    priority: doc.priority ?? "medium",
    sourceType: doc.sourceType ?? "manual",
    planId: typeof doc.relatedPlan === "number" ? doc.relatedPlan : doc.relatedPlan?.id ?? null,
    description: doc.description ?? null,
  }));

  return NextResponse.json({ month: monthParam, items, count: items.length });
}
```

- [ ] **Step 2: 验证端点编译和路由注册**

```bash
npx tsc --noEmit --pretty 2>&1 | grep "schedule/route" | head -5
```

Expected: 无输出（无错误）。

- [ ] **Step 3: Commit**

```bash
git add src/app/api/agent/schedule/route.ts
git commit -m "feat: add GET /api/agent/schedule endpoint for monthly schedule queries

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: 后端 —— 记忆查询 API

**Files:**
- Create: `src/app/api/agent/memory/route.ts`

- [ ] **Step 1: 创建 API 路由**

```typescript
// src/app/api/agent/memory/route.ts
import { NextResponse } from "next/server";
import type { Where } from "payload";
import { getPayloadAuthResult } from "@/lib/payload/auth";
import { getPayloadClient } from "@/lib/payload/client";

const VALID_TYPES = ["fact", "preference", "project_context", "workflow_rule", "writing_style"] as const;

export async function GET(request: Request) {
  const authResult = await getPayloadAuthResult();
  if (!authResult.user) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }

  const url = new URL(request.url);
  const typeParam = url.searchParams.get("type");
  const query = url.searchParams.get("q")?.trim() || null;
  const limit = Math.min(Number(url.searchParams.get("limit")) || 20, 50);

  const conditions: Where[] = [{ status: { equals: "active" } }];

  if (typeParam && (VALID_TYPES as readonly string[]).includes(typeParam)) {
    conditions.push({ type: { equals: typeParam } });
  }

  if (query) {
    conditions.push({ title: { contains: query } });
  }

  const where: Where = conditions.length === 1 ? conditions[0] : { and: conditions };

  const payload = await getPayloadClient();
  const result = await payload.find({
    collection: "agent-memories",
    depth: 0,
    limit,
    overrideAccess: true,
    sort: "-lastUsedAt",
    where,
  });

  const memories = result.docs.map((doc) => ({
    id: doc.id,
    title: doc.title,
    type: doc.type,
    confidence: doc.confidence ?? 0,
    content: doc.content,
    lastUsedAt: doc.lastUsedAt ?? null,
    updatedAt: doc.updatedAt,
  }));

  return NextResponse.json({ memories, total: result.totalDocs });
}
```

- [ ] **Step 2: 验证编译**

```bash
npx tsc --noEmit --pretty 2>&1 | grep "memory/route" | head -5
```

Expected: 无输出（无错误）。

- [ ] **Step 3: Commit**

```bash
git add src/app/api/agent/memory/route.ts
git commit -m "feat: add GET /api/agent/memory endpoint with type filter and search

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: 后端 —— build-context-step 按模式差异化加载

**Files:**
- Modify: `src/lib/agent/chat-pipeline/build-context-step.ts`
- Modify: `src/lib/agent/chat-pipeline/run-agent-chat-pipeline.ts`

- [ ] **Step 1: 扩展 runBuildContextStep 返回 contextSummary**

在 `src/lib/agent/chat-pipeline/build-context-step.ts` 中：

修改 `BuildContextStepResult` 类型，增加 `contextSummary` 字段：

```typescript
export type BuildContextStepResult = {
  context: ReturnType<typeof buildAgentContext>;
  contextSummary: string;  // 新增
  tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
  workingMemory: import("@/lib/agent/shared-context").WorkingMemory;
};
```

在 `runBuildContextStep` 函数末尾（L125 `return` 之前），根据 `workbenchMode` 和 `context` 构建 `contextSummary`：

```typescript
// 在 L114-123 的 parts 构建之后，L125 return 之前插入：
const contextSummary = (() => {
  const labels: string[] = [];
  if (workbenchMode === "today") {
    if (context.plans.length > 0) labels.push(`${context.plans.length} 项今日计划`);
    if (context.checklists.length > 0) labels.push(`${context.checklists.length} 份清单`);
    labels.push(`${context.timelineEvents?.length ?? 0} 个时间线事件`);
    return `今日模式 · 已加载 ${labels.join("、")}`;
  }
  if (workbenchMode === "writing") {
    if ((context.contentItems?.length ?? 0) > 0) labels.push(`${context.contentItems!.length} 条内容`);
    if ((context.memories?.length ?? 0) > 0) labels.push(`${context.memories!.length} 条写作记忆`);
    return `写作模式 · ${labels.length > 0 ? `已加载 ${labels.join("、")}` : "已就绪"}`;
  }
  if (workbenchMode === "plan" || workbenchMode === "execute") {
    if (context.plans.length > 0) labels.push(`${context.plans.length} 项计划`);
    if ((context.planReviews?.length ?? 0) > 0) labels.push(`${context.planReviews!.length} 条复盘`);
    return `计划模式 · ${labels.length > 0 ? `已加载 ${labels.join("、")}` : "已就绪"}`;
  }
  if (parts.length > 0) return `已加载：${parts.join("、")}`;
  return "上下文已就绪";
})();
```

然后修改 return 语句包含 `contextSummary`：

```typescript
return { context, contextSummary, tokenUsage, workingMemory };
```

- [ ] **Step 2: 在 pipeline runner 中将 contextSummary 传入 meta 事件**

在 `src/lib/agent/chat-pipeline/run-agent-chat-pipeline.ts` 中，找到 context step 调用处（L195-219），提取 `contextSummary`：

```typescript
// L195 原来: let contextStep = await runBuildContextStep({...});
// 改为:
let { context: initialContext, contextSummary, tokenUsage: contextTokenUsage, workingMemory: _wm } = await runBuildContextStep({...});
```

在 pipeline runner 的返回中通过一个内部变量追踪 `contextSummary`，并在最终 `lastResponse` 中附加上去。在 `stream-envelope.ts` 的 `meta` 事件 already 传递 `AgentChatResponse` —— 需要在 `AgentChatResponse` 类型中增加可选 `contextSummary` 字段。

修改 `src/lib/agent/schemas.ts` 中 `AgentChatResponse` 类型，增加：

```typescript
contextSummary?: string;
```

然后在 `run-agent-chat-pipeline.ts` 的 `persistAgentTurn` 闭包或最终 response 构造中，将 `contextSummary` 附加到 response。

在 run-agent-chat-pipeline.ts 中，找到 context step 后的代码（约 L219），将 `const { context: initialContext } = contextStep;` 改为：

```typescript
const initialContext = contextStep.context;
let lastContextSummary = contextStep.contextSummary;
```

在最终 return 的 lastResponse 处（L521），确保 contextSummary 被包含：

```typescript
// 在 lastResponse 构造处增加 contextSummary
if (!lastResponse) { /* ... */ }
// 在 return lastResponse 前
if (lastContextSummary) {
  lastResponse = { ...lastResponse, contextSummary: lastContextSummary };
}
```

在 `stream-envelope.ts` 的 `createAgentChatStream` 中，将 `contextSummary` 传递到 meta 事件。在 `meta` enqueue 处增加：

```typescript
// 在 enqueue("meta", { ... }) 中增加 contextSummary
contextSummary: payload.contextSummary,
```

在前端 `use-agent-chat-messaging.ts` 的 `onMeta` 回调中接收 `contextSummary`。

修改 `src/components/dashboard/agent-chat/use-agent-chat-messaging.ts`：

在 `sendMessage` 函数中，将 `onMeta` 回调从 `() => undefined` 改为实际处理函数：

```typescript
// L249 附近，原来: onMeta: () => undefined,
// 改为: onMeta 回调类型需要扩展，但当前 readAgentChatStream 的 onMeta 签名是 (meta: {...}) => void
// 在 sendMessage 调用处增加 onMeta 处理
onMeta: (meta) => {
  if (typeof meta.contextSummary === "string") {
    setStatusText(meta.contextSummary);
  }
},
```

- [ ] **Step 3: 验证编译**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: 无新增类型错误。

- [ ] **Step 4: Commit**

```bash
git add src/lib/agent/chat-pipeline/build-context-step.ts src/lib/agent/chat-pipeline/run-agent-chat-pipeline.ts src/lib/agent/schemas.ts src/lib/agent/chat-pipeline/stream-envelope.ts src/components/dashboard/agent-chat/use-agent-chat-messaging.ts
git commit -m "feat: add mode-aware contextSummary to build-context-step and SSE meta events

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: 前端 —— DashboardShell 视图路由

**Files:**
- Modify: `src/components/dashboard/DashboardShell.tsx`
- Modify: `src/components/dashboard/DashboardPageClient.tsx`

- [ ] **Step 1: 在 DashboardShell 增加 activeMode 驱动的视图路由**

在 `src/components/dashboard/DashboardShell.tsx` 中：

`activeMode` 已经是 state（`DashboardIconMode`）。在 `MainWorkspace` 的 children 渲染处，增加模式路由。找到 `<MainWorkspace>` JSX（约 L222）：

```tsx
// 现有:
<MainWorkspace>
  <DashboardInspectorControlProvider value={inspectorControl}>
    <DashboardModeProvider value={activeMode}>
      {children}
    </DashboardModeProvider>
  </DashboardInspectorControlProvider>
</MainWorkspace>

// 改为:
<MainWorkspace>
  {activeMode === "schedule" ? (
    <ScheduleMonthView
      onBackToWorkbench={() => setActiveMode("agent")}
      threadId={threadId}
    />
  ) : activeMode === "memory" ? (
    <MemoryCardGrid
      onBackToWorkbench={() => setActiveMode("agent")}
      threadId={threadId}
    />
  ) : (
    <DashboardInspectorControlProvider value={inspectorControl}>
      <DashboardModeProvider value={activeMode}>
        {children}
      </DashboardModeProvider>
    </DashboardInspectorControlProvider>
  )}
</MainWorkspace>
```

需要在文件顶部增加 import：

```typescript
import { ScheduleMonthView } from "./schedule/ScheduleMonthView";
import { MemoryCardGrid } from "./memory/MemoryCardGrid";
```

- [ ] **Step 2: 模式切换时同步 workbenchMode**

在 `handleModeChange` 中（L129-137），除了调用 `onRunPrompt(prompt)`，还需要根据模式设置 workbenchMode。但目前 `setWorkbenchMode` 在 `DashboardPageClient` 中通过 props 传入。增加一个映射逻辑。

由于 `workbenchMode` 是 `AgentWorkbenchMode` 类型，需要从 `DashboardIconMode` 映射：

```typescript
// 在 DashboardShell.tsx 顶部增加映射表
const iconModeToWorkbenchMode: Partial<Record<DashboardIconMode, AgentWorkbenchMode>> = {
  agent: "ask",
  today: "today",
  plans: "plan",
  writing: "writing",
  // schedule 和 memory 不映射到 AgentWorkbenchMode（不走对话 pipeline）
};
```

由于 `setWorkbenchMode` 需要通过 props 传入，需要在 `DashboardShellProps` 中增加 `onWorkbenchModeChange` prop。在 `DashboardPageClient.tsx` 中传递。

修改 `src/components/dashboard/DashboardPageClient.tsx`：

```tsx
// 在 DashboardShell props 中增加:
onWorkbenchModeChange={chat.setWorkbenchMode}
```

修改 `src/components/dashboard/DashboardShell.tsx` props 类型和参数解构，增加：

```typescript
onWorkbenchModeChange?: (mode: AgentWorkbenchMode) => void;
```

在 `handleModeChange` 中：

```typescript
const handleModeChange = useCallback(
  (_mode: DashboardIconMode, prompt: string) => {
    setActiveMode(_mode);
    const wm = iconModeToWorkbenchMode[_mode];
    if (wm) {
      onWorkbenchModeChange?.(wm);
    }
    if (prompt) {
      onRunPrompt(prompt);
    }
  },
  [onRunPrompt, onWorkbenchModeChange],
);
```

- [ ] **Step 3: 验证编译**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: 无类型错误（`ScheduleMonthView` 和 `MemoryCardGrid` 尚未创建，会有 import 错误——这是预期的，在 Task 6/7 解决）。

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/DashboardShell.tsx src/components/dashboard/DashboardPageClient.tsx
git commit -m "feat: add view routing in DashboardShell based on activeMode

- Route schedule mode to ScheduleMonthView placeholder
- Route memory mode to MemoryCardGrid placeholder
- Map DashboardIconMode to AgentWorkbenchMode for chat pipeline
- Add onWorkbenchModeChange prop

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: 前端 —— ScheduleMonthView 月历组件

**Files:**
- Create: `src/components/dashboard/schedule/ScheduleMonthView.tsx`
- Create: `src/app/styles/sunny-dashboard-schedule.css`
- Modify: `src/app/styles/sunny-dashboard-shell.css`（在文件顶部或 globals.css 中 @import）

- [ ] **Step 1: 创建 ScheduleMonthView 组件**

```typescript
// src/components/dashboard/schedule/ScheduleMonthView.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type ScheduleItemSummary = {
  id: number;
  title: string;
  date: string;
  startTime: null | string;
  endTime: null | string;
  status: string;
  priority: string;
  sourceType: string;
  planId: null | number;
  description: null | string;
};

type ScheduleMonthViewProps = {
  onBackToWorkbench: () => void;
  threadId: null | number;
};

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

function getDaysInMonth(year: number, month: number): Date[] {
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const lastDay = new Date(Date.UTC(year, month, 0));
  const startOffset = (firstDay.getUTCDay() + 6) % 7; // Mon=0
  const days: Date[] = [];

  for (let i = startOffset - 1; i >= 0; i--) {
    const d = new Date(firstDay);
    d.setUTCDate(d.getUTCDate() - (i + 1));
    days.push(d);
  }

  for (let d = 1; d <= lastDay.getUTCDate(); d++) {
    days.push(new Date(Date.UTC(year, month - 1, d)));
  }

  const remaining = 7 - (days.length % 7);
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(lastDay);
      d.setUTCDate(d.getUTCDate() + i);
      days.push(d);
    }
  }

  return days;
}

function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function ScheduleMonthView({ onBackToWorkbench }: ScheduleMonthViewProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [items, setItems] = useState<ScheduleItemSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<null | string>(null);
  const [selectedDate, setSelectedDate] = useState<null | string>(null);

  const monthKey = `${year}-${String(month).padStart(2, "0")}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/agent/schedule?month=${monthKey}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(typeof data?.message === "string" ? data.message : "加载失败");
        }
        return res.json();
      })
      .then((data: { items: ScheduleItemSummary[] }) => {
        if (!cancelled) setItems(data.items ?? []);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "加载日程失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [monthKey]);

  const days = useMemo(() => getDaysInMonth(year, month), [year, month]);
  const itemsByDate = useMemo(() => {
    const map = new Map<string, ScheduleItemSummary[]>();
    for (const item of items) {
      const list = map.get(item.date) ?? [];
      list.push(item);
      map.set(item.date, list);
    }
    return map;
  }, [items]);

  const goToPrevMonth = useCallback(() => {
    if (month === 1) { setYear((y) => y - 1); setMonth(12); }
    else setMonth((m) => m - 1);
    setSelectedDate(null);
  }, [month]);

  const goToNextMonth = useCallback(() => {
    if (month === 12) { setYear((y) => y + 1); setMonth(1); }
    else setMonth((m) => m + 1);
    setSelectedDate(null);
  }, [month]);

  const isCurrentMonth = (date: Date) => date.getUTCMonth() + 1 === month;
  const isToday = (date: Date) => formatDateKey(date) === formatDateKey(now);

  const selectedItems = selectedDate ? (itemsByDate.get(selectedDate) ?? []) : [];
  const priorityClass = (p: string) => p === "high" ? "is-high" : p === "low" ? "is-low" : "";

  return (
    <div className="sunny-schedule-month-view">
      <div className="sunny-schedule-month-head">
        <button type="button" className="sunny-schedule-back-btn" onClick={onBackToWorkbench}>
          ← 返回工作台
        </button>
        <div className="sunny-schedule-month-nav">
          <button type="button" onClick={goToPrevMonth} aria-label="上个月">←</button>
          <h2>{year}年{month}月</h2>
          <button type="button" onClick={goToNextMonth} aria-label="下个月">→</button>
        </div>
        <span className="sunny-schedule-month-count">{loading ? "加载中..." : error ? `错误: ${error}` : `${items.length} 项日程`}</span>
      </div>

      <div className="sunny-schedule-grid">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="sunny-schedule-weekday">{label}</div>
        ))}
        {days.map((date) => {
          const key = formatDateKey(date);
          const dayItems = itemsByDate.get(key) ?? [];
          return (
            <button
              key={key}
              type="button"
              className={`sunny-schedule-day${isCurrentMonth(date) ? "" : " is-other-month"}${isToday(date) ? " is-today" : ""}${selectedDate === key ? " is-selected" : ""}`}
              onClick={() => setSelectedDate(selectedDate === key ? null : key)}
            >
              <span className="sunny-schedule-day-num">{date.getUTCDate()}</span>
              {dayItems.length > 0 ? (
                <span className="sunny-schedule-day-dots">
                  {dayItems.slice(0, 3).map((item) => (
                    <span key={item.id} className={`sunny-schedule-dot ${priorityClass(item.priority)}`} />
                  ))}
                  {dayItems.length > 3 ? <span className="sunny-schedule-dot-more">+{dayItems.length - 3}</span> : null}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {selectedDate ? (
        <div className="sunny-schedule-day-detail">
          <h3>{selectedDate} 日程</h3>
          {selectedItems.length === 0 ? (
            <p className="sunny-schedule-empty-day">当天无日程安排</p>
          ) : (
            <ul className="sunny-schedule-item-list">
              {selectedItems.map((item) => (
                <li key={item.id} className={`sunny-schedule-item ${priorityClass(item.priority)}`}>
                  <span className="sunny-schedule-item-time">
                    {item.startTime ? `${item.startTime}${item.endTime ? ` - ${item.endTime}` : ""}` : "全天"}
                  </span>
                  <span className="sunny-schedule-item-title">{item.title}</span>
                  <span className={`sunny-schedule-item-status is-${item.status}`}>
                    {item.status === "done" ? "✓" : item.status === "canceled" ? "✗" : "○"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: 创建样式文件**

```css
/* src/app/styles/sunny-dashboard-schedule.css */
.sunny-schedule-month-view {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.25rem;
  height: 100%;
  overflow-y: auto;
}

.sunny-schedule-month-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.sunny-schedule-back-btn {
  background: none;
  border: 1px solid var(--sunny-border);
  border-radius: 6px;
  padding: 0.35rem 0.75rem;
  font-size: 0.8125rem;
  color: var(--sunny-fg-secondary);
  cursor: pointer;
}
.sunny-schedule-back-btn:hover { color: var(--sunny-fg); background: var(--sunny-bg-hover); }

.sunny-schedule-month-nav {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.sunny-schedule-month-nav h2 { font-size: 1.1rem; font-weight: 600; margin: 0; min-width: 8rem; text-align: center; }
.sunny-schedule-month-nav button {
  background: none; border: 1px solid var(--sunny-border); border-radius: 6px;
  padding: 0.25rem 0.6rem; cursor: pointer; font-size: 0.875rem;
}
.sunny-schedule-month-nav button:hover { background: var(--sunny-bg-hover); }

.sunny-schedule-month-count { font-size: 0.8125rem; color: var(--sunny-fg-secondary); }

.sunny-schedule-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
  border: 1px solid var(--sunny-border);
  border-radius: 8px;
  overflow: hidden;
}

.sunny-schedule-weekday {
  padding: 0.5rem 0.25rem;
  text-align: center;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--sunny-fg-secondary);
  background: var(--sunny-bg-subtle);
  border-bottom: 1px solid var(--sunny-border);
}

.sunny-schedule-day {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  padding: 0.4rem 0.2rem;
  min-height: 3.5rem;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.8125rem;
  transition: background 0.1s;
}
.sunny-schedule-day:hover { background: var(--sunny-bg-hover); }
.sunny-schedule-day.is-other-month { opacity: 0.35; }
.sunny-schedule-day.is-today .sunny-schedule-day-num {
  background: var(--sunny-accent, #2563eb);
  color: #fff;
  border-radius: 50%;
  width: 1.5rem;
  height: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
}
.sunny-schedule-day.is-selected { background: var(--sunny-bg-active); }

.sunny-schedule-day-num { font-weight: 500; }

.sunny-schedule-day-dots {
  display: flex;
  gap: 2px;
  flex-wrap: wrap;
  justify-content: center;
}

.sunny-schedule-dot {
  width: 5px; height: 5px; border-radius: 50%; background: var(--sunny-fg-secondary);
}
.sunny-schedule-dot.is-high { background: #ef4444; }
.sunny-schedule-dot.is-low { background: #9ca3af; }
.sunny-schedule-dot-more { font-size: 0.625rem; color: var(--sunny-fg-secondary); }

.sunny-schedule-day-detail {
  border-top: 1px solid var(--sunny-border);
  padding-top: 0.75rem;
}
.sunny-schedule-day-detail h3 { font-size: 0.9375rem; font-weight: 600; margin: 0 0 0.5rem; }
.sunny-schedule-empty-day { color: var(--sunny-fg-secondary); font-size: 0.8125rem; }

.sunny-schedule-item-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.4rem; }
.sunny-schedule-item {
  display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.6rem;
  border: 1px solid var(--sunny-border); border-radius: 6px; font-size: 0.8125rem;
}
.sunny-schedule-item.is-high { border-left: 3px solid #ef4444; }
.sunny-schedule-item-time { color: var(--sunny-fg-secondary); min-width: 5rem; font-variant-numeric: tabular-nums; }
.sunny-schedule-item-title { flex: 1; }
.sunny-schedule-item-status.is-done { color: #22c55e; }
.sunny-schedule-item-status.is-canceled { color: #ef4444; }
```

- [ ] **Step 3: 在 globals.css 或 dashboard shell CSS 中 import 新样式**

在 `src/app/globals.css` 末尾增加（或 `sunny-dashboard-shell.css` 中）：

```css
@import "./styles/sunny-dashboard-schedule.css";
```

- [ ] **Step 4: 验证编译**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: 无类型错误。

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/schedule/ScheduleMonthView.tsx src/app/styles/sunny-dashboard-schedule.css src/app/globals.css
git commit -m "feat: add ScheduleMonthView with monthly calendar grid and day detail panel

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: 前端 —— MemoryCardGrid 记忆卡片组件

**Files:**
- Create: `src/components/dashboard/memory/MemoryCardGrid.tsx`
- Create: `src/app/styles/sunny-dashboard-memory.css`

- [ ] **Step 1: 创建 MemoryCardGrid 组件**

```typescript
// src/components/dashboard/memory/MemoryCardGrid.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type MemorySummary = {
  id: number;
  title: string;
  type: string;
  confidence: number;
  content: string;
  lastUsedAt: null | string;
  updatedAt: string;
};

type MemoryCardGridProps = {
  onBackToWorkbench: () => void;
  threadId: null | number;
};

const TYPE_LABELS: Record<string, string> = {
  fact: "事实",
  preference: "偏好",
  project_context: "项目上下文",
  workflow_rule: "工作流规则",
  writing_style: "写作风格",
};

const TYPE_OPTIONS = [
  { value: "", label: "全部类型" },
  { value: "preference", label: "偏好" },
  { value: "project_context", label: "项目上下文" },
  { value: "writing_style", label: "写作风格" },
  { value: "workflow_rule", label: "工作流规则" },
  { value: "fact", label: "事实" },
];

function relativeTime(iso: null | string): string {
  if (!iso) return "从未使用";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return `${Math.floor(days / 30)} 个月前`;
}

export function MemoryCardGrid({ onBackToWorkbench }: MemoryCardGridProps) {
  const [memories, setMemories] = useState<MemorySummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<null | string>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [expandedId, setExpandedId] = useState<null | number>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchMemories = useCallback((q: string, type: string) => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (q.trim()) params.set("q", q.trim());
    params.set("limit", "30");

    fetch(`/api/agent/memory?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(typeof data?.message === "string" ? data.message : "加载失败");
        }
        return res.json();
      })
      .then((data: { memories: MemorySummary[] }) => setMemories(data.memories ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : "加载记忆失败"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchMemories("", ""); }, [fetchMemories]);

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchMemories(value, typeFilter), 300);
  }, [fetchMemories, typeFilter]);

  const handleTypeChange = useCallback((value: string) => {
    setTypeFilter(value);
    fetchMemories(query, value);
  }, [fetchMemories, query]);

  return (
    <div className="sunny-memory-card-grid">
      <div className="sunny-memory-head">
        <button type="button" className="sunny-memory-back-btn" onClick={onBackToWorkbench}>
          ← 返回工作台
        </button>
        <div className="sunny-memory-toolbar">
          <input
            type="text"
            className="sunny-memory-search"
            placeholder="搜索记忆标题..."
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
          />
          <select
            className="sunny-memory-type-filter"
            value={typeFilter}
            onChange={(e) => handleTypeChange(e.target.value)}
          >
            {TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <span className="sunny-memory-count">
          {loading ? "加载中..." : error ? `错误: ${error}` : `${memories.length} 条记忆`}
        </span>
      </div>

      <div className="sunny-memory-cards">
        {memories.map((mem) => (
          <div
            key={mem.id}
            className={`sunny-memory-card${expandedId === mem.id ? " is-expanded" : ""}`}
            onClick={() => setExpandedId(expandedId === mem.id ? null : mem.id)}
          >
            <div className="sunny-memory-card-header">
              <span className={`sunny-memory-type-badge is-${mem.type}`}>
                {TYPE_LABELS[mem.type] ?? mem.type}
              </span>
              {mem.confidence >= 0.8 ? <span className="sunny-memory-star" title="高置信度">★</span> : null}
            </div>
            <h3 className="sunny-memory-card-title">{mem.title}</h3>
            <span className="sunny-memory-card-time">{relativeTime(mem.lastUsedAt)}</span>
            {expandedId === mem.id ? (
              <p className="sunny-memory-card-content">{mem.content}</p>
            ) : null}
          </div>
        ))}
        {!loading && memories.length === 0 ? (
          <p className="sunny-memory-empty">暂无记忆记录</p>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 创建样式文件**

```css
/* src/app/styles/sunny-dashboard-memory.css */
.sunny-memory-card-grid {
  display: flex; flex-direction: column; gap: 1rem;
  padding: 1.25rem; height: 100%; overflow-y: auto;
}

.sunny-memory-head {
  display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap;
}

.sunny-memory-back-btn {
  background: none; border: 1px solid var(--sunny-border); border-radius: 6px;
  padding: 0.35rem 0.75rem; font-size: 0.8125rem; color: var(--sunny-fg-secondary); cursor: pointer;
}
.sunny-memory-back-btn:hover { color: var(--sunny-fg); background: var(--sunny-bg-hover); }

.sunny-memory-toolbar { display: flex; gap: 0.5rem; }
.sunny-memory-search {
  border: 1px solid var(--sunny-border); border-radius: 6px; padding: 0.35rem 0.6rem;
  font-size: 0.8125rem; min-width: 12rem; background: var(--sunny-bg); color: var(--sunny-fg);
}
.sunny-memory-type-filter {
  border: 1px solid var(--sunny-border); border-radius: 6px; padding: 0.35rem 0.5rem;
  font-size: 0.8125rem; background: var(--sunny-bg); color: var(--sunny-fg);
}
.sunny-memory-count { font-size: 0.8125rem; color: var(--sunny-fg-secondary); }

.sunny-memory-cards {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 0.75rem;
}

.sunny-memory-card {
  border: 1px solid var(--sunny-border); border-radius: 8px; padding: 0.75rem;
  cursor: pointer; transition: box-shadow 0.15s; display: flex; flex-direction: column; gap: 0.35rem;
}
.sunny-memory-card:hover { box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
.sunny-memory-card.is-expanded { border-color: var(--sunny-accent, #2563eb); }

.sunny-memory-card-header { display: flex; align-items: center; gap: 0.35rem; }
.sunny-memory-type-badge {
  font-size: 0.6875rem; font-weight: 600; padding: 0.1rem 0.4rem; border-radius: 4px;
  background: var(--sunny-bg-subtle); color: var(--sunny-fg-secondary);
}
.sunny-memory-type-badge.is-preference { background: #dbeafe; color: #1d4ed8; }
.sunny-memory-type-badge.is-project_context { background: #dcfce7; color: #15803d; }
.sunny-memory-type-badge.is-writing_style { background: #fef3c7; color: #b45309; }
.sunny-memory-type-badge.is-workflow_rule { background: #f3e8ff; color: #7c3aed; }
.sunny-memory-type-badge.is-fact { background: #fce7f3; color: #be185d; }

.sunny-memory-star { color: #f59e0b; font-size: 0.75rem; }
.sunny-memory-card-title { font-size: 0.875rem; font-weight: 600; margin: 0; }
.sunny-memory-card-time { font-size: 0.75rem; color: var(--sunny-fg-secondary); }
.sunny-memory-card-content { font-size: 0.8125rem; color: var(--sunny-fg); line-height: 1.5; margin: 0.25rem 0 0; padding-top: 0.5rem; border-top: 1px solid var(--sunny-border); }
.sunny-memory-empty { color: var(--sunny-fg-secondary); font-size: 0.8125rem; grid-column: 1 / -1; text-align: center; padding: 2rem 0; }
```

- [ ] **Step 3: 在 globals.css 中 import 新样式**

```css
@import "./styles/sunny-dashboard-memory.css";
```

- [ ] **Step 4: 验证编译**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: 无类型错误。

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/memory/MemoryCardGrid.tsx src/app/styles/sunny-dashboard-memory.css src/app/globals.css
git commit -m "feat: add MemoryCardGrid with search, type filter, and expandable cards

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: 前端 —— 模式标签 badge + StatusBar 增强

**Files:**
- Modify: `src/components/dashboard/agent/AgentContextPanel.tsx`
- Modify: `src/components/dashboard/DashboardStatusBar.tsx`
- Modify: `src/app/styles/sunny-agent.css`

- [ ] **Step 1: 在 AgentContextPanel 增加模式标签**

在 `src/components/dashboard/agent/AgentContextPanel.tsx` 中：

Props 增加 `workbenchMode`：

```typescript
import type { AgentWorkbenchMode } from "@/lib/agent/workbench-mode";

type AgentContextPanelProps = {
  // ... 现有 props ...
  workbenchMode?: AgentWorkbenchMode | null;
};
```

在组件函数参数中解构 `workbenchMode`，在面板 header（`sunny-agent-context-grid-v2` 上方）增加模式标签：

```tsx
const modeLabel = workbenchMode === "today" ? "今日"
  : workbenchMode === "writing" ? "写作"
  : workbenchMode === "plan" ? "计划"
  : workbenchMode === "execute" ? "执行"
  : workbenchMode === "review" ? "回顾"
  : workbenchMode === "timeline" ? "时间线"
  : workbenchMode === "ask" ? "工作台"
  : null;

return (
  <div className="sunny-agent-inspector-panel">
    {modeLabel ? (
      <span className="sunny-mode-badge" data-mode={workbenchMode ?? "agent"}>{modeLabel}模式</span>
    ) : null}
    {/* 现有内容不变 */}
  </div>
);
```

- [ ] **Step 2: 将 workbenchMode 传入 AgentContextPanel**

在 `DashboardRightPanel.tsx` 中，`workbenchMode` 已经是 prop，传给 `AgentContextPanel`：

```tsx
<AgentContextPanel
  // ... 现有 props ...
  workbenchMode={workbenchMode}
/>
```

- [ ] **Step 3: 在 DashboardStatusBar 显示 contextSummary**

修改 `src/components/dashboard/DashboardStatusBar.tsx`，增加可选的 `contextSummary` prop：

```typescript
export type DashboardStatusBarProps = {
  branch?: string;
  model?: string;
  searchAvailable?: boolean;
  statusLabel: string;
  contextSummary?: string;  // 新增
};

export function DashboardStatusBar({
  branch = "main",
  model = "DeepSeek V3",
  searchAvailable = true,
  statusLabel,
  contextSummary,
}: DashboardStatusBarProps) {
  return (
    <footer className="sunny-dashboard-status-bar" role="status" aria-label="工作台状态">
      <span className="sunny-dashboard-status-dot" aria-hidden="true" />
      <span>{model}</span>
      <span aria-hidden="true">|</span>
      <span>{branch}</span>
      <span style={{ flex: 1 }} />
      {contextSummary ? (
        <>
          <span className="sunny-dashboard-context-summary">{contextSummary}</span>
          <span aria-hidden="true">|</span>
        </>
      ) : null}
      {searchAvailable ? (
        <>
          <span aria-hidden="true">⌘K</span>
          <span aria-hidden="true">|</span>
        </>
      ) : null}
      <span>{statusLabel}</span>
    </footer>
  );
}
```

在 `DashboardShell.tsx` 中将 `contextSummary` 传递给 `DashboardStatusBar`（需要从 `useAgentDashboardChat` 中增加该状态并一路传递）。

在 `use-agent-dashboard-chat.ts` 中增加 state:

```typescript
const [contextSummary, setContextSummary] = useState("");
```

在 `use-agent-chat-messaging.ts` 的 `onMeta` 回调中设置（已在 Task 4 Step 2 中处理）。

- [ ] **Step 4: 增加 CSS 样式**

在 `src/app/styles/sunny-agent.css` 末尾增加：

```css
/* 模式标签 */
.sunny-mode-badge {
  display: inline-block;
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  margin-bottom: 0.5rem;
}
.sunny-mode-badge[data-mode="today"] { background: #dbeafe; color: #1d4ed8; }
.sunny-mode-badge[data-mode="writing"] { background: #fef3c7; color: #b45309; }
.sunny-mode-badge[data-mode="plan"],
.sunny-mode-badge[data-mode="execute"] { background: #dcfce7; color: #15803d; }
.sunny-mode-badge[data-mode="review"] { background: #f3e8ff; color: #7c3aed; }
.sunny-mode-badge[data-mode="timeline"] { background: #fce7f3; color: #be185d; }
.sunny-mode-badge[data-mode="ask"],
.sunny-mode-badge[data-mode="agent"] { background: var(--sunny-bg-subtle); color: var(--sunny-fg-secondary); }

/* StatusBar 上下文摘要 */
.sunny-dashboard-context-summary {
  font-size: 0.75rem;
  color: var(--sunny-fg-secondary);
  max-width: 24rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

- [ ] **Step 5: 验证编译**

```bash
npx tsc --noEmit --pretty 2>&1 | head -20
```

Expected: 无类型错误。

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/agent/AgentContextPanel.tsx src/components/dashboard/DashboardStatusBar.tsx src/components/dashboard/DashboardRightPanel.tsx src/app/styles/sunny-agent.css src/components/dashboard/agent-chat/use-agent-dashboard-chat.ts
git commit -m "feat: add mode badge to context panel and contextSummary to status bar

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: 端到端验证 & 集成测试

**Files:**
- Modify: `tests/agent/dashboard-conversation-utils.test.ts`（新建或追加）
- Create: `tests/agent/dashboard-schedule-api.test.ts`（可选）

- [ ] **Step 1: 运行现有测试确认无回归**

```bash
npx playwright test --reporter=line 2>&1 | tail -20
```

Expected: 所有现有测试通过，无新增失败。

- [ ] **Step 2: 验证 Schedule API 端点**

```bash
# 启动 dev server 后手动测试
curl -s http://localhost:3000/api/agent/schedule?month=2026-06 | jq '.count'
```

Expected: 返回当月日程数量。

- [ ] **Step 3: 验证 Memory API 端点**

```bash
curl -s http://localhost:3000/api/agent/memory | jq '.total'
curl -s "http://localhost:3000/api/agent/memory?type=preference" | jq '.total'
```

Expected: 返回记忆总数，类型过滤生效。

- [ ] **Step 4: 验证 TypeScript 完整编译**

```bash
npx tsc --noEmit 2>&1 | tail -5
```

Expected: 无类型错误。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test: verify schedule/memory API endpoints and full type check

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 实现顺序依赖

```
Task 1 (类型扩展) ← 所有后续任务的基础
  ├── Task 2 (schedule API)  独立
  ├── Task 3 (memory API)    独立
  ├── Task 4 (context step 差异化) ← 依赖 Task 1
  ├── Task 5 (视图路由)       ← 依赖 Task 1
  │     ├── Task 6 (ScheduleMonthView) ← 依赖 Task 2 + 5
  │     └── Task 7 (MemoryCardGrid)    ← 依赖 Task 3 + 5
  └── Task 8 (badge + status) ← 依赖 Task 1 + 4

Task 9 (验证) ← 所有任务完成后
```
