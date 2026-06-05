# Dashboard Shell 布局重构 — 设计文档

## 目标

将 `/dashboard` 路由从「全屏 Agent 工作台 + 顶部 Chrome 条」重构为「双层左侧导航 + 中间单页面 + 底部状态栏」的 Claude Code/Codex 式布局，保持所有现有功能不丢失。

## 现有布局 vs 目标布局

```
现有                                      目标
┌─────────────────────────────────┐      ┌──┬────────┬──────────────────────────┐
│ DashboardWorkspaceChrome (顶栏)  │      │图│ 展开面板 │      主区域 (flex)        │
│ S | DeepSeek | Cmd+K | Admin... │      │标│ 会话列表 │                          │
├────┬───────────────────┬────────┤      │栏│ 建议/最近│  [模式切换 chips]         │
│左栏│   中间对话区       │ 检查器  │      │48│         │                          │
│280 │   (Agent 工作台)   │ 280    │      │px│         │  对话区 / 欢迎区           │
│px  │                   │ px     │      │  │         │                          │
│    │                   │        │      │  │         │  ┌───────────────────┐   │
│    │                   │        │      │  │         │  │ 输入框      [发送] │   │
│    │                   │        │      │  │         │  └───────────────────┘   │
│    │                   │        │      │  │         ├──────────────────────────┤
│    │                   │        │      │  │         │ DeepSeek | main | 就绪   │
└────┴───────────────────┴────────┘      └──┴────────┴──────────────────────────┘
```

## 架构概览

### 新组件

| 组件 | 职责 | 尺寸 |
|------|------|------|
| `DashboardShell` | 顶层 Grid 容器，组合三区 + 底栏 | 100vw × 100vh |
| `DashboardIconBar` | 品牌 + 页面导航图标 + 搜索 + 主题/设置 | 48px 宽 |
| `DashboardSlidePanel` | 会话列表、建议、最近执行（承接原 AgentSidebar 内容） | 280px 宽，可折叠 |
| `DashboardStatusBar` | 模型名、分支、token 用量、就绪状态 | 28px 高 |
| `DashboardInspectorToggle` | 右下角按钮，唤起检查器 Drawer | 32×32px 浮动 |

### 修改组件

| 组件 | 改动 |
|------|------|
| `AgentWorkbench` | 移除 `sidebar` prop，不再接收 `AgentSidebar`；`inspector` 改为默认 Drawer 模式 |
| `AgentSidebar` | 拆分为两部分：导航 → `DashboardIconBar`；会话/建议/执行 → `DashboardSlidePanel` |
| `AgentChatPanel` | 不再渲染 `AgentWorkbench` 的外层 Shell，改为接收 `DashboardShell` 的 children |
| `page.tsx` | 用 `DashboardShell` 包裹 `DashboardAgentChatFullSection` |

### 移除/废弃

| 组件 | 原因 |
|------|------|
| `DashboardWorkspaceChrome` | 功能分散到 IconBar + StatusBar |
| `AgentWorkbenchShell` | 由 `DashboardShell` 替代 |
| `AgentWorkbenchLayout` | Grid 布局由 `DashboardShell` 直接管理 |

## 详细设计

### 1. DashboardShell

```
DashboardShell
├── DashboardIconBar (fixed, left: 0)
├── DashboardSlidePanel (collapsible, left: 48px)
├── main
│   └── {children} (原 AgentChatPanel → AgentWorkbench center)
├── DashboardInspectorToggle (fixed, right-bottom)
└── DashboardStatusBar (fixed, bottom: 0)
```

**Props:**
```ts
type DashboardShellProps = {
  children: ReactNode;
  defaultThreadId?: number;
  quickPrompts: AgentQuickPrompt[];
  suggestions: AgentInboxSuggestion[];
};
```

内部管理 slide panel 展开/折叠状态、当前活跃图标导航、inspector drawer 状态。

### 2. DashboardIconBar

```
┌────────────┐
│     S      │ ← 品牌标识 (active = Agent 模式)
│  ────────  │
│    📅      │ ← 页面/模式切换图标
│    📋      │
│    ⏱️      │
│    ✏️      │
│    🧠      │
│  ────────  │
│    🔍      │ ← 全局搜索 (Cmd+K)
│  ────────  │
│    🌙      │ ← 主题切换
│    ⚙       │ ← 设置
└────────────┘
```

- 每个图标是 `<button>`，active 态有左侧 accent 色指示条
- 点击图标 → 切换主区域 Agent 上下文模式（注入预设 prompt）
- 品牌 S 图标复用 `SiteBrand` 组件
- 主题切换复用 `ThemeToggle`
- 底部图标固定在 bar 底部（`margin-top: auto`）

### 3. DashboardSlidePanel

分节结构（承接原 `AgentSidebar` 内容）：

```
┌─────────────────┐
│ Agent 会话    [+]│ ← header + 新建按钮
│ [搜索会话...]    │ ← 搜索输入框
│─────────────────│
│ 当前             │
│ ● 本周工作计划 #24│ ← active 态
│ ● 学习 Rust   ⚠  │ ← pending
│─────────────────│
│ 建议             │
│ ○ 周末复盘   建议 │
│ ○ 检查延期   建议 │
│─────────────────│
│ 最近             │
│ ● 添加备注   #23 │
│ ○ 创建日程   #22 │
└─────────────────┘
```

- 可折叠：通过图标栏或面板顶部按钮切换
- 复用 `AgentTaskRow` 组件渲染每条
- 搜索防抖 300ms
- 新建按钮 → 触发 `onNewThread`

### 4. 模式切换 Chips

原 `AgentSidebar` 的 `workspaceNav` 硬编码链接改为中间主区域顶部的模式 chips：

```tsx
const modes = [
  { key: 'agent', label: 'Agent', prompt: '' },
  { key: 'today', label: '今日', prompt: '帮我整理今天最应该推进的工作' },
  { key: 'plans', label: '计划', prompt: '帮我检查所有进行中计划的进度' },
  { key: 'schedule', label: '日程', prompt: '帮我查看最近的日程安排' },
  { key: 'writing', label: '写作', prompt: '帮我整理最近的写作素材' },
  { key: 'memory', label: '记忆', prompt: '帮我回顾最近的经验教训' },
];
```

- 切换模式 → 自动填入对应 prompt 到输入框（不自动发送）
- 当前活跃模式高亮
- 同时更新 `DashboardIconBar` 的对应图标 active 态

### 5. DashboardStatusBar

```
 DeepSeek V3 | main | 🔍 Cmd+K | 上下文 2.4k | 就绪
```

- 左侧：模型名 + 分支
- 中间：留空（flex spacer）
- 右侧：搜索入口 + 上下文 token + 状态文本
- 复用 `AgentTokenMeter` 的 `formatTokenCount`

### 6. AgentWorkbench 适配

当前 `AgentWorkbench` 接收 `sidebar` prop 并渲染左侧 `AgentSidebar`。重构后：

- 移除 `sidebar` / `sidebarCollapsed` props
- `inspector` prop 改为固定 `drawer=true`
- `layout` prop 移除（不再需要三栏切换）
- center 区域保持不变（`AgentThinkingPanel` + `AgentConversation` + `AgentComposer`）

### 7. AgentChatPanel 适配

移除对 `AgentWorkbenchShell` 的渲染，改为：

```tsx
// before
<AgentWorkbench sidebar={...} center={...} inspector={...} />

// after
<AgentWorkbench
  activeInspectorTab={...}
  errorMessage={...}
  // ... 保留所有 center + inspector props
  // 移除 sidebar/Shell 相关 props
/>
```

外层由 `DashboardShell` 包装。

### 8. AgentInspector 抽屉化

当前 Inspector 有三种模式：inline（右栏常驻）、compact（底部折叠）、drawer（底部抽屉）。重构后改为右侧滑入式 Drawer：

- 移除 inline 和 compact 模式，固定使用 Drawer 模式
- 右下角 `DashboardInspectorToggle` 按钮切换 open/close
- 打开时从**右侧**滑入面板（复用当前 drawer 的 backdrop + focus trap + Escape 逻辑，调整 CSS 为 `right: 0; top: 0; bottom: 28px; width: 360px;` 替代当前的底部定位）
- `AgentInspector` 组件本身不改动，仅外层调用改为 `<AgentInspector drawer={inspectorOpen} ... />`
- `DashboardInspectorToggle` 仅是一个触发按钮（`onClick → setInspectorOpen`），实际抽屉渲染在 Inspector 内部

## CSS 策略

### 新增样式文件：`sunny-dashboard-shell.css`

```css
/* Grid 容器 */
.sunny-dashboard-shell { display: grid; grid-template-columns: 48px 280px 1fr; ... }
.sunny-dashboard-shell.panel-collapsed { grid-template-columns: 48px 1fr; }

/* 图标栏 */
.sunny-dashboard-icon-bar { ... }

/* 状态栏 */
.sunny-dashboard-status-bar { ... }
```

- 新增 CSS 变量：`--dashboard-icon-bar-width: 48px`, `--dashboard-panel-width: 280px`, `--dashboard-status-height: 28px`
- 沿用现有 tokens（`--border`, `--surface`, `--accent` 等）
- 深色模式：通过 `html[data-theme="dark"]` 覆盖
- 响应式：小屏自动折叠 panel

### 现有 CSS 修改

| 文件 | 改动 |
|------|------|
| `globals.css` | 新增 `@import './sunny-dashboard-shell.css'` |
| `sunny-agent.css` | 移除对 `.sunny-agent-left-rail-column` 的 grid 布局依赖（保留组件内部样式） |
| `sunny-chrome.css` | 移除 Dashboard 顶栏相关样式（如有） |

## 数据流

```
DashboardShell (状态: activeMode, panelOpen, inspectorOpen)
  ├─ DashboardIconBar
  │   onModeChange → setActiveMode → 更新 chips + prompt
  │   onTogglePanel → setPanelOpen
  │   onToggleInspector → setInspectorOpen
  │
  ├─ DashboardSlidePanel
  │   threads, suggestions, recentRuns (来自 useAgentThreadList)
  │   onLoadThread, onNewThread, onSearchThreads
  │
  ├─ main > AgentWorkbench
  │   input, messages, pendingAction, isSubmitting...
  │   (来自 useAgentChatMessaging — 完全不动)
  │
  ├─ DashboardInspectorToggle
  │   点击 → setInspectorOpen
  │
  └─ DashboardStatusBar
      model, tokens, statusLabel (从 AgentChatPanel 透传)
```

关键原则：**Agent 核心逻辑（useAgentChatMessaging / useAgentThreadList）零改动**，只改外层包装。

## 实现步骤

| Step | 内容 | 风险 | 预计文件数 |
|------|------|------|------------|
| 1 | 新建 `sunny-dashboard-shell.css`，定义 Grid + 图标栏 + 状态栏样式 | 低 | 2 (css + globals 导入) |
| 2 | 新建 `DashboardShell` + `DashboardIconBar` + `DashboardStatusBar` | 低 | 3 |
| 3 | 新建 `DashboardSlidePanel`，从 `AgentSidebar` 提取会话/建议/执行区块 | 中 | 1 |
| 4 | 新建 `DashboardInspectorToggle`，适配 `AgentInspector` drawer 模式 | 低 | 1 |
| 5 | 适配 `AgentWorkbench`（去 sidebar/Shell，inspector drawer 化） | 中 | 1 |
| 6 | 改造 `page.tsx`，串联 DashboardShell + AgentWorkbench | 中 | 1 |
| 7 | 删除废弃组件 + 清理 CSS / 验证深色模式 | 低 | 2-3 |
| 8 | 添加模式切换 chips 交互 + 图标栏联动 | 低 | 1 |

## 不变清单（功能零丢失保证）

- `useAgentChatMessaging` — 零改动
- `useAgentThreadList` — 零改动
- `AgentConversation` — 零改动
- `AgentComposer` — 零改动
- `AgentApprovalCard` — 零改动
- `AgentThinkingPanel` — 零改动
- `AgentMarkdownBubble` — 零改动
- `AgentTokenMeter` — 零改动
- `AgentContextPanel` / `AgentApprovalPanel` / `AgentTracePanel` — 零改动
- 所有 API 路由 — 零改动
- 所有 lib/agent/* — 零改动

## 风险与回滚

- 每一步独立提交，出问题单步回滚
- Step 1-4 可与现有布局并存（新组件不替换旧组件）
- Step 5 是关键切换点：`page.tsx` 有两个版本（注释切换即可回退）
- CSS 命名隔离：新样式用 `.sunny-dashboard-*` 前缀，不与 `.sunny-agent-*` 冲突
