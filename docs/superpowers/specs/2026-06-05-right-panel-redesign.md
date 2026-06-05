# 右侧面板重构 — 设计文档

## 目标

将 Dashboard 右侧的 `AgentInspector`（Tab 切换式面板）重构为三个堆叠 Card：
1. **当前上下文** — 会话环境、引用数据、token 用量
2. **待处理事项** — 建议动作 + 风险提醒
3. **历史与执行** — 会话历史 / 执行记录（内部 Tab 切换）

## 当前状态 vs 目标状态

```
当前 (AgentInspector)                    目标 (DashboardRightPanel)
┌────────────────────┐                  ┌────────────────────┐
│ [上下文][确认][记录]│ ← Tabs           │  当前上下文        │ ← Card
├────────────────────┤                  ├────────────────────┤
│                    │                  │  待处理事项        │ ← Card
│  Tab 内容区        │                  │  ├ 建议动作        │
│  (一次只看一个)    │                  │  └ 风险提醒        │
│                    │                  ├────────────────────┤
│                    │                  │  历史与执行        │ ← Card
│                    │                  │  [会话历史][执行]  │ ← 内部 Tab
└────────────────────┘                  └────────────────────┘
```

## 架构

### 新组件

| 组件 | 职责 |
|------|------|
| `DashboardRightPanel` | 右侧面板容器，组合三个 Card，替换 `AgentInspector` |
| `ContextCard` | 当前上下文：项目、会话、摘要、引用、操作按钮 |
| `PendingActionsCard` | 待处理事项：建议动作列表 + 风险提醒 |
| `HistoryCard` | 历史与执行：内部两个 Tab（会话历史 / 执行记录） |

### 修改组件

| 组件 | 改动 |
|------|------|
| `DashboardShell` | 新增右侧面板区域，传递右侧面板所需 props |
| `DashboardPageClient` | 新增 `AgentInspectorTab` state（历史 Card 内部使用），传递右侧面板数据 |
| `AgentWorkbench` | 移除 `inspectorPanel` 渲染，移除 `AgentInspector` 导入 |

### 移除组件

| 组件 | 原因 |
|------|------|
| `AgentInspector` | 被 `DashboardRightPanel` 替代 |
| `AgentInspectorTabs` | 不再需要全局 Tab 切换 |

### 保持不变

- `AgentContextPanel` — 内部逻辑可被 ContextCard 复用
- `AgentApprovalPanel` — PendingActionsCard 替代其展示逻辑
- `AgentTracePanel` — HistoryCard 的执行记录 Tab 复用其渲染
- `AgentArtifactsPanel` — 不变
- `AgentTaskRow` — 不变

## 详细设计

### 1. DashboardRightPanel — 嵌入 Grid 布局

`DashboardShell` 的 Grid 新增第 4 列（右侧面板，340px）：

```css
/* 默认 4 列 */
grid-template-columns: 48px 280px 1fr 340px;
/* 面板折叠时 3 列 */
.is-panel-collapsed { grid-template-columns: 48px 1fr 340px; }
/* 响应式窄屏 2 列，右侧 panel 隐藏 */
@media (max-width: 900px) { grid-template-columns: 48px 1fr; }
```

右侧面板为 Grid 第 4 列（`grid-column: 4; grid-row: 1 / -1`），与 slide panel 的 `grid-row: 1 / -1` 对称，拥有独立的 `overflow-y: auto` 滚动。

```
DashboardRightPanel
├── ContextCard
├── PendingActionsCard
└── HistoryCard
     ├── Tab: 会话历史
     └── Tab: 执行记录
```

**Props:**
```ts
type DashboardRightPanelProps = {
  /* Context card */
  threadId: null | number;
  statusLabel: string;
  messages: AgentChatMessage[];
  traceSteps: AgentTraceStep[];
  contextPreferences: ContextPreferences;
  tokenUsage: AgentTokenUsage;
  onToggleContextExclude?: (key: string) => void;
  onToggleContextPin?: (key: string) => void;

  /* Pending card */
  pendingAction: null | PendingAction;
  suggestions: AgentInboxSuggestion[];
  quickPrompts: AgentQuickPrompt[];
  onRunSuggestion: (suggestion: AgentInboxSuggestion) => void;
  onRunPrompt: (prompt: string) => void;
  onCancelApproval: () => void;
  onConfirmApproval: () => void;
  onEditApproval: (kind: "plan" | "schedule" | "generic") => void;

  /* History card */
  threads: AgentThreadSummary[];
  recentRuns: AgentRunSummary[];
  traceSteps: AgentTraceStep[];
  selectedRunDetail?: AgentRunDetail | null;
  onLoadThread: (threadId: number) => void;
  onSelectRun?: (runId: number) => void;

  /* Rollback (从原 AgentInspector 迁移) */
  artifactsRollbackBusy?: boolean;
  artifactsRollbackError?: null | string;
  selectedRunRollbackBusy?: boolean;
  selectedRunRollbackError?: null | string;
  lastRollbackPayload?: null | unknown;
  lastRollbackResult?: AgentRollbackExecutionResult | null;
  onArtifactsRollback?: () => void;
  onRollbackSelectedRun?: () => void;
};
```

### 2. ContextCard

**数据来源:**
- 当前项目: 硬编码 "SunnyPanel"（后续从配置读取）
- 当前会话: `threadId` → thread title
- 会话摘要: `messages` 中最新 assistant message 前 3 行
- 已引用: `traceSteps` 的 context 类型 steps → 正则解析计划/文件/记忆数量
- Token: `tokenUsage.contextTokens` → formatTokenCount

**Props:**
```ts
type ContextCardProps = {
  threadId: null | number;
  statusLabel: string;
  messages: AgentChatMessage[];
  traceSteps: AgentTraceStep[];
  contextPreferences: ContextPreferences;
  tokenUsage: AgentTokenUsage;
  onRefresh?: () => void;
  onAddContext?: () => void;
  onViewDetail?: () => void;
};
```

**UI 结构:**
- Header: "当前上下文" + info icon
- Info rows: 当前项目、当前会话、会话摘要（max 3 lines, line-clamp）
- Referenced section: 计划 N / 文件 N / 记忆 N / 上下文 Nk tokens（compact chips）
- Actions row: "查看详情" / "刷新上下文" / "添加上下文"（text buttons）

### 3. PendingActionsCard

**合并原 AgentApprovalPanel + 建议列表**

**Props:**
```ts
type PendingActionsCardProps = {
  pendingAction: null | PendingAction;
  suggestions: AgentInboxSuggestion[];
  quickPrompts: AgentQuickPrompt[];
  onRunSuggestion: (suggestion: AgentInboxSuggestion) => void;
  onRunPrompt: (prompt: string) => void;
  onCancelApproval: () => void;
  onConfirmApproval: () => void;
};
```

**建议动作为 Action Card:**
```
● 标题
  简短描述（1行截断）
  [风险标签: 低/中/高]          [查看]
  [采纳] [忽略]
```

**颜色策略:**
- 低风险: 灰色 / 绿色
- 中风险: amber / yellow
- 高风险: 红色（仅此处使用红色）

**风险提醒**（从 pendingAction 的 approval 等待提取）:
```
⚠ 风险提醒
等级: 中 · 来源: 批量写入日程
2个日程项时间重叠
[处理] [稍后] [忽略]
```

### 4. HistoryCard

**内部两个 Tab:** 会话历史 / 执行记录

**会话历史 Tab:**
- 复用 `AgentTaskRow` 渲染每条 thread
- 当前会话高亮（`thread.id === threadId`）
- 显示标题、`thread.pendingAction` 摘要、Thread 编号
- 点击切换 `onLoadThread(thread.id)`

**执行记录 Tab:**
- 数据来源: `recentRuns`（AgentRunSummary） + `traceSteps`（当前实时 steps）
- 每条记录: 工具名、状态（成功/失败/等待确认/执行中）、时间
- 状态指示: ✅ 成功 / ❌ 失败 / ⏳ 等待确认 / 🔄 执行中

## CSS 规格

### 变量
```css
--right-panel-width: 340px;
--right-panel-card-gap: 12px;
--right-panel-card-radius: 16px;
--right-panel-card-bg: #ffffff;
--right-panel-card-border: #E5E7EB;
--right-panel-card-padding: 14px 16px;
```

### 面板容器
```css
.sunny-dashboard-right-panel {
  width: var(--right-panel-width);
  display: flex;
  flex-direction: column;
  gap: var(--right-panel-card-gap);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0 var(--right-panel-card-gap);
}
```

### Cards 通用
```css
.sunny-dashboard-right-card {
  background: var(--right-panel-card-bg);
  border: 1px solid var(--right-panel-card-border);
  border-radius: var(--right-panel-card-radius);
  padding: var(--right-panel-card-padding);
}
```

### Card 内滚动
- ContextCard: 不滚动，固定高度自适应
- PendingActionsCard: `max-height: 40vh; overflow-y: auto;`
- HistoryCard: `max-height: 35vh; overflow-y: auto;`

### 深色模式
```css
html[data-theme="dark"] .sunny-dashboard-right-card {
  background: var(--surface);
  border-color: var(--border);
}
```

## 数据流

```
DashboardPageClient (所有 state)
  ├─ DashboardShell
  │    ├─ DashboardRightPanel (新增)
  │    │    ├─ ContextCard ← threadId, messages, traceSteps, tokenUsage
  │    │    ├─ PendingActionsCard ← pendingAction, suggestions, quickPrompts
  │    │    └─ HistoryCard ← threads, recentRuns, traceSteps
  │    │
  │    └─ main > AgentWorkbench (移除 inspectorPanel)
```

## 不变清单

- `useAgentChatMessaging` — 零改动
- `useAgentThreadList` — 零改动
- `AgentConversation` — 零改动
- `AgentComposer` — 零改动
- `AgentApprovalCard` — 零改动
- `AgentThinkingPanel` — 零改动
- `AgentMarkdownBubble` — 零改动
- `AgentTokenMeter` — 零改动
- 所有 API 路由 — 零改动

## 实现步骤

| Step | 内容 | 文件数 |
|------|------|--------|
| 1 | 新建 `sunny-dashboard-right-panel.css` | 2 (css + globals) |
| 2 | 新建 `ContextCard` 组件 | 1 |
| 3 | 新建 `PendingActionsCard` 组件 | 1 |
| 4 | 新建 `HistoryCard` 组件 | 1 |
| 5 | 新建 `DashboardRightPanel` 组装 | 1 |
| 6 | 适配 `DashboardShell` 新增右侧区 | 1 |
| 7 | 适配 `DashboardPageClient` 传递右侧数据 | 1 |
| 8 | 从 `AgentWorkbench` 移除 `AgentInspector` | 1 |
| 9 | 清理废弃导出 + 构建验证 | 2-3 |
