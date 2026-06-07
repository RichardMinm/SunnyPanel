# Dashboard 模式切换差异化上下文 —— 技术规格

> 状态: 设计确认 | 日期: 2026-06-07 | 分组: A（上下文差异化）

## 1. 目标

将 Dashboard 左侧栏 6 种工作模式（agent/today/plans/schedule/writing/memory）从「仅发送预设 prompt」升级为真正的差异化体验：

- **agent/plans/today/writing**：保持对话界面为主，后端根据模式自动注入专属数据上下文
- **schedule**：切换为月历视图，点击日期查看日程
- **memory**：切换为记忆卡片网格，支持搜索和类型过滤

## 2. 架构概览

```
DashboardShell
  ├── SidebarNav (DashboardIconBar)  ← 模式切换，已有高亮逻辑
  ├── MainWorkspace
  │   ├── workbenchMode === "schedule" → <ScheduleMonthView />
  │   ├── workbenchMode === "memory"   → <MemoryCardGrid />
  │   └── 其他模式                     → <AgentWorkbench /> (现有对话)
  └── DashboardRightPanel             ← 不变
```

数据流：
```
模式切换 → setWorkbenchMode(mode) 
  → DashboardShell 路由到正确视图
  → 对话模式: useAgentChatMessaging 传 workbenchMode 给 POST /api/agent/chat
    → build-context-step 按模式加载差异化数据
  → 专用视图: ScheduleMonthView / MemoryCardGrid 直接调新 API
```

## 3. 后端改动

### 3.1 模式感知的上下文构建

**文件**: `src/lib/agent/chat-pipeline/build-context-step.ts`

**现状**: 所有请求加载相同上下文（plans + checklists + memories + timeline + recent runs）。

**改动**: 在 `runBuildContextStep` 中根据 `workbenchMode` 加载额外数据，扩展返回的 `context` 对象。

| 模式 | 额外查询 | 优先级/排序 |
|------|---------|------------|
| `today` | `schedule-items` where date=today, `plans` where dueDate=today | 日程 > 计划 > 清单 |
| `plans` | 全部进行中 plans (增加 depth/limit), 最近 plan-reviews | 计划 > 回顾 |
| `writing` | 最近 posts (limit 5), 最近 notes (limit 5), writing_style 类型记忆 | 素材 > 风格 |
| `agent` | 不变 | 均衡 |
| 其他 | 无需 context（schedule/memory 走专用视图） | — |

**实现细节**:
- `workbenchMode` 已作为参数传入，只需增加 switch 分支
- `today` 模式：按日期过滤 schedule-items（date equals today），plans 按 dueDate 过滤
- `plans` 模式：增加 plan-reviews 查询，depth 设为 1 以获取关联文档
- `writing` 模式：查询 posts + notes + AgentMemory（type=writing_style）
- 不改变下游接口——context 对象已支持扩展字段
- 在 context step 返回中附加 `contextSummary` 字段（如 "已加载 3 项今日日程、2 项待办计划"）

### 3.2 日程查询 API

**文件**: `src/app/api/agent/schedule/route.ts`（新建）

**端点**: `GET /api/agent/schedule?month=2026-06`

**认证**: 复用 `getPayloadAuthResult`

**响应**:
```json
{
  "month": "2026-06",
  "items": [
    {
      "id": 1,
      "title": "团队周会",
      "date": "2026-06-08",
      "startTime": "09:30",
      "endTime": "10:30",
      "status": "pending",
      "priority": "high",
      "sourceType": "plan",
      "planId": 3
    }
  ],
  "count": 12
}
```

**查询逻辑**: 
- 解析 `month` 参数计算该月第一天和最后一天
- 查询 `schedule-items` where date >= 月初 AND date <= 月末
- 按 date ASC, startTime ASC 排序
- 需要时可直接修改 ScheduleItem collection 加字段

### 3.3 记忆查询 API

**文件**: `src/app/api/agent/memory/route.ts`（新建）

**端点**: `GET /api/agent/memory?type=&q=&limit=20`

**认证**: 复用 `getPayloadAuthResult`

**响应**:
```json
{
  "memories": [
    {
      "id": 5,
      "title": "偏好使用 TypeScript 严格模式",
      "type": "preference",
      "confidence": 0.9,
      "lastUsedAt": "2026-06-05T10:00:00Z",
      "content": "..."
    }
  ],
  "total": 42
}
```

**查询逻辑**:
- 查询 `agent-memories`，按 `lastUsedAt` DESC
- 可选过滤：`type`（精确匹配）、`q`（title contains）
- 默认 limit=20，max=50
- 需要时可直接修改 AgentMemory collection 加字段

## 4. 前端改动

### 4.1 视图路由

**文件**: `src/components/dashboard/DashboardShell.tsx`

在 `MainWorkspace` 的 children 渲染处增加模式路由：

```tsx
// 伪代码示意
{workbenchMode === "schedule" ? (
  <ScheduleMonthView threadId={threadId} />
) : workbenchMode === "memory" ? (
  <MemoryCardGrid threadId={threadId} />
) : (
  children  // 现有 AgentWorkbench
)}
```

`workbenchMode` prop 已从 `useAgentDashboardChat` 传递到 `DashboardShell`，无需新增 prop drilling。

### 4.2 ScheduleMonthView

**文件**: `src/components/dashboard/schedule/ScheduleMonthView.tsx`（新建）

**功能**:
- 月视图日历网格（7列 × 5-6行），React 状态管理当前月份
- 月初加载：`GET /api/agent/schedule?month=YYYY-MM`
- 有日程的日期显示圆点标记（最多 3 个，超过显示 "+N"）
- 点击日期 → 内联 popover 列出该日所有日程项（标题、时间、状态）
- 点击日程项 → 可触发 Inspector 打开（预留，当前阶段用 console 占位）
- 月份切换按钮（← 上月 / 下月 →）
- 「返回工作台」按钮切换回 agent 模式

**样式**: 新建 `src/app/styles/sunny-dashboard-schedule.css`，遵循现有 token 体系

**依赖**: 无外部日历库，纯 CSS Grid 实现

### 4.3 MemoryCardGrid

**文件**: `src/components/dashboard/memory/MemoryCardGrid.tsx`（新建）

**功能**:
- 卡片网格布局（CSS Grid，响应式 2-4 列）
- 每张卡片：标题、类型标签（彩色 badge）、置信度（如 >0.8 显示星标）、最后使用时间（相对时间）
- 顶部工具栏：搜索输入框 + 类型下拉筛选（全部/preference/project_context/writing_style/workflow_rule/fact）
- 搜索防抖 300ms，直接调 `GET /api/agent/memory?q=&type=`
- 点击卡片 → 展开完整内容（内联 expand，非跳转）
- 「返回工作台」按钮

**样式**: 新建 `src/app/styles/sunny-dashboard-memory.css`

### 4.4 模式标签

**文件**: `src/components/dashboard/agent/AgentContextPanel.tsx`

在面板 header 区（threadId + statusLabel 旁）增加模式标签：

```html
<span class="sunny-mode-badge" data-mode="plans">📋 计划模式</span>
```

标签映射:

| 模式 | 标签 | data-mode |
|------|------|-----------|
| agent | 工作台 | agent |
| today | 今日 | today |
| plans | 计划 | plans |
| writing | 写作 | writing |

(schedule/memory 不走对话，不在此显示)

**样式**: 在 `sunny-agent.css` 中增加 `.sunny-mode-badge` 规则，用 `data-mode` 属性控制色调

### 4.5 StatusBar 模式文案

**文件**: `src/components/dashboard/DashboardStatusBar.tsx`

statusLabel 已存在。模式切换时自动更新为上下文摘要。数据来源：
- 对话模式：从 SSE `meta` 事件中新增的 `contextSummary` 字段读取
- 专用视图：组件内部管理（如 "6月 · 12项日程"）

## 5. 不涉及的改动

- 不修改 Payload Collection schema（现有字段满足需求；若后续不够再加）
- 不修改 DashboardIconBar / SidebarNav（已有模式切换 + 高亮）
- 不修改 AgentComposer / AgentConversation / MessageCard
- 不修改 pipeline 下游（orchestration / intent / dry-run / execute 步骤）
- 不修改 useAgentChatMessaging（workbenchMode 已透传）
- 不新增 npm 依赖

## 6. 测试要点

- `GET /api/agent/schedule` 无认证返回 401
- `GET /api/agent/schedule?month=2026-06` 返回当月日程
- `GET /api/agent/memory?type=preference` 返回过滤后的记忆
- ScheduleMonthView 月份切换加载正确数据
- MemoryCardGrid 搜索防抖正确触发请求
- 模式切换路由到正确视图
- 对话模式 context 包含模式专属数据（today 模式含今日日程）

## 7. 文件清单

| # | 文件 | 操作 |
|---|------|------|
| 1 | `src/lib/agent/chat-pipeline/build-context-step.ts` | 修改 |
| 2 | `src/app/api/agent/schedule/route.ts` | 新建 |
| 3 | `src/app/api/agent/memory/route.ts` | 新建 |
| 4 | `src/components/dashboard/schedule/ScheduleMonthView.tsx` | 新建 |
| 5 | `src/components/dashboard/memory/MemoryCardGrid.tsx` | 新建 |
| 6 | `src/components/dashboard/DashboardShell.tsx` | 修改 |
| 7 | `src/components/dashboard/agent/AgentContextPanel.tsx` | 修改 |
| 8 | `src/components/dashboard/DashboardStatusBar.tsx` | 修改 |
| 9 | `src/app/styles/sunny-dashboard-schedule.css` | 新建 |
| 10 | `src/app/styles/sunny-dashboard-memory.css` | 新建 |
| 11 | `src/app/styles/sunny-agent.css` | 修改 |
