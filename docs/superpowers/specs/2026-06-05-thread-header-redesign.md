# Thread Header 改造设计

## 目标

将中间主内容区 Header 从技术化展示（Thread #13）改为产品化展示，让用户一眼理解当前会话的主题、状态和元信息。

## 组件拆分

从 `AgentConversation` 中提取独立 `ThreadHeader` 组件：

```
src/components/dashboard/agent/
├── AgentConversation.tsx   ← 简化为消息列表容器
├── ThreadHeader.tsx         ← 新增：独立的 Header 组件
└── ...
```

## Header 结构

```
┌─────────────────────────────────────────────────────────────┐
│  AGENT 会话                                    [执行中]      │  ← 行1: 小标签 + 状态 badge
│  写作素材整理                                    [✎]        │  ← 行2: 主标题 (点击可编辑)
│  Thread #13 · 3 分钟前 · 1.1k tokens                         │  ← 行3: 元信息
├─────────────────────────────────────────────────────────────┤  ← 1px border
│  消息区域...                                                  │
```

- 行1 小标签用已有的 `.sunny-agent-run-surface-head p` 样式
- 行2 主标题点击进入 inline 编辑模式
- 行3 元信息为灰色小字，用 `·` 分隔

## 状态 Badge 逻辑

| 状态 | 颜色 | 判断条件 |
|------|------|----------|
| 已就绪 | 蓝/绿 | 空闲，无执行，无待确认动作 |
| 执行中 | 紫色 | `isSubmitting === true` |
| 等待确认 | 黄色 | `pendingAction` 存在 + 低风险操作（咨询/澄清等） |
| 有风险 | 红色 | `pendingAction` 存在 + 高风险操作（写入/修改任务、计划、日程等） |

风险判断依据：
- `type === "await_confirmation"` 且 `action.riskLevel === "high"` → 有风险
- `type === "await_batch_confirmation"` 且任一 action 的 `riskLevel === "high"` → 有风险
- 其他 pendingAction 类型（`await_completion_note` 等写操作 intent）→ 有风险
- `type === "await_confirmation"` 且 `riskLevel` 为 low/medium → 等待确认
- 澄清类 pendingAction → 等待确认

高风险 intent 列表（涉及写入/修改任务数据）：
`create_plan`, `compose_plan`, `compose_schedule_item`, `compose_timeline_event`,
`append_plan_item`, `complete_plan_item`, `schedule_plan`, `reschedule_item`,
`cancel_schedule_item`, `save_memory`, `add_completion_note`

低风险 intent（仅咨询/澄清）：
`answer_question`, `clarify`, `query_progress`, `query_plan_progress`, `evaluate_plan`

## 标题策略

- 如果用户已自定义标题（`thread.title !== "Agent Thread"`），显示该标题
- 否则取第一条用户消息的前 30 个字符作为默认标题，末尾加 `...`
- 如果连用户消息都没有，显示 "新会话"
- Thread ID 不作为主标题，移到第三行元信息中

## 标题编辑交互

- 点击标题 → 原地变为 `<input>`，自动 focus 并全选
- Enter → 保存并退出编辑
- Escape → 取消编辑，恢复原标题
- 失焦 → 保存并退出编辑
- 保存调用 `PATCH /api/agent/thread`（需新增 title 支持）

## API 改造

### PATCH `/api/agent/thread`

新增字段支持：
```ts
{ title?: string }  // 新增：会话标题，长度限制 200
```

## 数据流

### 组件树传递

```
useAgentDashboardChat (hook)
  → 新增 threadTitle, lastInteractionAt 状态
  → 新增 renameThread 方法
    ↓
AgentWorkbench
  → 透传 threadTitle, lastInteractionAt, onRenameThread
    ↓
AgentConversation
  → 透传给 ThreadHeader
    ↓
ThreadHeader (新组件)
  → 内部推导 statusBadge
  → 渲染 header UI
```

### 新增 props

| 组件 | 新增 Prop | 类型 | 来源 |
|------|----------|------|------|
| AgentConversation | `threadTitle` | `string` | `useAgentDashboardChat` |
| AgentConversation | `lastInteractionAt` | `string \| null` | thread API 响应 |
| AgentConversation | `onRenameThread` | `(title: string) => Promise<boolean>` | hook 方法 |

### Hook 新增

`useAgentDashboardChat`:
- 新增 `threadTitle` state，在 `loadThread` 时从 API 响应中读取 `selectedThread.title`
- 新增 `renameThread(title): Promise<boolean>` 方法，调用 `PATCH /api/agent/thread`

## CSS 要求

- Header 固定在滚动区域顶部：`position: sticky; top: 0;`
- 背景：白色 / 半透明毛玻璃 `backdrop-filter: blur(8px)`
- 底部 1px border
- Badge 颜色通过 CSS 变量或具体 class 控制
- 标题编辑 input 与 h2 同字号，无额外边框

## 不做的事情

- 不新增"所属项目"字段（项目模式未开发）
- 不新增"分支"字段
- 不映射模型名称为友好名称（暂无映射表）
