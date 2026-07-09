# Design System

## 1. Scope

Applies to:

- Public Site
- Dashboard
- Writing
- Planning
- Agent Workbench
- Agent Activity / Trace
- Inspector

---

## 2. Rules

- 使用统一组件库
- 使用统一 design tokens
- 使用统一动画规范
- 避免零散 token
- 避免页面级一次性样式
- 避免重复实现基础组件
- 新 UI 需求优先通过已有组件组合完成
- Public Site 与 Dashboard 可有不同布局，但共享基础 token

---

## 3. Component Layers

```txt
components/
├── ui/              基础 UI 组件
├── layout/          布局组件
├── dashboard/       Dashboard 专用组件
├── public/          Public Site 专用组件
├── agent/           Agent Activity / Trace 组件
└── content/         Writing / Markdown / Article 展示组件
```

### Base UI Components

- Button
- Input
- Textarea
- Select
- Dialog
- Drawer
- Tabs
- Card
- Badge
- Tooltip
- Dropdown
- Command
- Skeleton
- EmptyState
- Toast
- Separator

Rules:

- 基础组件不得绑定具体业务逻辑
- 业务页面不得重复实现基础组件
- 新增组件前先审计可复用组件

### Layout Components

- AppShell
- DashboardShell
- PublicShell
- Sidebar
- Topbar
- InspectorPanel
- ContentContainer
- PageHeader
- SectionHeader

Rules:

- 页面布局优先使用 Layout Components
- 不在每个页面重复写 shell 结构

### Agent Components

- AgentWorkbench
- AgentActivityTimeline
- AgentStatusBadge
- PendingConfirmationCard
- ReceiptCard
- RollbackStatus
- DeveloperTracePanel

Rules:

- 展示结构化状态
- 不展示真实 Chain-of-Thought
- 不展示 raw prompt / raw LLM response / secret

---

## 4. Design Tokens

Token types:

- color
- typography
- spacing
- radius
- shadow
- border
- z-index
- motion
- layout size

Rules:

- 不在页面中硬编码颜色
- 不在页面中硬编码阴影
- 不新增零散 spacing token
- 不混用多个命名体系
- Tailwind class 必须基于统一 token 体系

Semantic tokens:

- background
- foreground
- muted
- muted-foreground
- card
- card-foreground
- border
- primary
- primary-foreground
- secondary
- secondary-foreground
- accent
- destructive
- success
- warning
- info

---

## 5. Motion Strategy

Allowed uses:

- 页面进入
- 面板展开 / 收起
- Dialog / Drawer
- Agent Activity 状态变化
- Pending Confirmation 出现
- Receipt 生成
- Rollback 状态提示
- Loading / Skeleton
- Empty State

Rules:

- 动画服务状态变化
- 动画不伪造执行进度
- 不在核心业务逻辑中耦合动画状态
- 不引入多个动画库
- Agent Activity 动画由结构化状态驱动

---

## 6. V1 Scope

Supports:

- 统一基础组件使用
- 统一 token 命名
- 统一 Dashboard / Public Shell
- 统一 Agent Activity 展示组件
- 统一内容展示组件
- 克制的基础过渡动画

Not supported:

- 完整组件文档站
- Storybook 强制接入
- 多主题复杂系统
- 高级品牌设计系统
- 大规模视觉重构
- 多套动画库并存
- 页面级零散 design token
