# Dashboard 面板体验升级 —— 技术规格

> 状态: 设计确认 | 日期: 2026-06-07 | 分组: B（面板体验）

## 1. 目标

将 Dashboard 的 4 个面板体验短板补齐：侧边栏搜索/归档、关联对象卡片化、Thinking 推理折叠。

## 2. 架构概览

```
DashboardIconBar
  ├── [新增] 搜索框 → 实时本地过滤 threads（title + tags）
  ├── [现有] 工作区模式切换
  ├── [现有] 会话列表（受搜索过滤）
  └── [新增] 已归档折叠区（独立 API 加载）

DashboardRightPanel > LinkedObjectsPanel
  ├── [改造] 从 action.affectedDocuments 读取结构化数据
  ├── [新增] 每条关联渲染为小卡片（类型+标题+操作+链接）
  └── [新增] 点击跳转到 Payload admin 或 public 页面

AgentConversation > MessageCard
  ├── [新增] Thinking 折叠区：thinking token → 可折叠面板
  └── [新增] 调试开关下展示 trace 数据

AgentChatResponse（schemas.ts）
  └── [新增] affectedDocuments 摘要字段
```

## 3. 详细设计

### 3.1 侧边栏搜索框 + 归档

**文件**: `src/components/dashboard/DashboardIconBar.tsx`

**搜索框**:
- 在「主操作」区和「项目」区之间插入搜索输入框
- `const [searchQuery, setSearchQuery] = useState("")` 管理搜索词
- 防抖 200ms 后过滤 `threads`：`threads.filter(t => t.title.includes(query) || t.tags?.some(tag => tag.includes(query)))`
- 搜索框有清除按钮（×）
- 若 `filteredThreads.length === 0 && searchQuery` 显示「未找到匹配会话，按 Enter 搜索全部」（预留后端搜索）
- 搜索框支持 Enter 键触发后端搜索 `GET /api/agent/thread?q=`

**归档折叠区**:
- 在会话列表下方增加「📦 已归档 (N) ▸」折叠按钮
- 点击后加载 `GET /api/agent/thread?archived=true`（后端已支持）
- 展开后显示归档 threads，每条有「恢复」按钮（调用 `PATCH /api/agent/thread { id, archived: false }`）
- 连续点击折叠按钮切换展开/收起，缓存已加载的归档列表

### 3.2 关联对象面板（卡片预览 + 跳转）

**后端改动**:

`AgentChatResponse` 新增 `affectedDocuments` 字段：
```typescript
affectedDocuments?: Array<{
  collection: string;      // "plans" | "schedule-items" | "notes" | "posts" | "checklists"
  documentId?: number;
  operation: "create" | "delete" | "update";
  title?: string;           // 文档标题
  adminHref?: string;       // Payload admin 链接
  publicHref?: string;      // 公开页面链接
}>;
```

pipeline 执行写入后，填充此字段。在 `execute-and-persist-step.ts` 和 `dry-run-and-propose-step.ts` 中，从 `AgentTaskObservation.affectedDocuments` 提取并附加上标题和链接。

**前端**: `LinkedObjectsPanel` 组件重写：

- 根据 `affectedDocuments` 渲染卡片列表（非现有二元状态）
- 每张卡片：左侧 collection 图标 + 类型标签彩标 + 标题 + 操作标签（创建/更新/删除）
- 点击卡片 → `window.open(href, '_blank')` 跳转到 Payload admin
- 无数据时显示现有空状态
- debug 模式下额外显示 `documentId` 和 `rollbackStrategy`

### 3.3 Thinking 折叠

**文件**: `src/components/dashboard/agent/MessageCard.tsx` + `AgentConversation.tsx`

**MessageCard 改造**:
- 新增 prop `thinkingContent?: string`（来自 SSE thinking token 或 trace context steps）
- 新增 prop `isThinking?: boolean`（流式进行中）
- 当 `thinkingContent` 非空时，在消息内容上方渲染折叠区

**折叠区交互**:
- 默认折叠，`isThinking === true` 时自动展开
- 点击标题栏切换展开/折叠
- 展开时显示 thinking 文本（pre-wrap，等宽字体）
- 折叠栏标题：「🧠 思考过程」+ 步数（从 trace context steps 中提取）

**数据来源优先级**:
1. SSE `token` event `block: 'thinking'` → `thinkingContent` state（已在 useAgentDashboardChat 中）
2. SSE `trace` events 中 `kind: 'context'` 和 `kind: 'analysis'` 的 steps
3. 非流式场景从 `response.trace` 中提取

### 3.4 Debug 模式增强

在现有 `debugMode`（通过 Inspector 底部开关切换）下：

- 关联对象面板：显示 `documentId`、`rollbackStrategy`、`operation` 原始值
- Thinking 面板：显示 trace step 的完整 `detail` 文本（非摘要）
- 侧边栏：thread 条目标显示 `lastIntent` 和 `lastEngine` 原始值

## 4. 测试

| # | 测试 | 类型 |
|---|------|------|
| 1 | `DashboardIconBar` 搜索过滤：输入关键词，验证过滤结果 | 单元测试 |
| 2 | `DashboardIconBar` 归档区：展开/收起/恢复操作 | 单元测试 |
| 3 | `LinkedObjectsPanel` 卡片渲染：affectedDocuments → 卡片数量+内容 | 单元测试 |
| 4 | `MessageCard` Thinking 折叠：展开/折叠/自动展开 | 单元测试 |
| 5 | `schemas.ts` affectedDocuments 类型：TypeScript 编译验证 | 类型测试 |
| 6 | API 端点验证：`GET /api/agent/thread?archived=true` | 集成测试 |

## 5. 不涉及的改动

- 不修改 pipeline 核心逻辑（只在响应中附带摘要数据）
- 不修改 Payload Collection schema
- 不修改 AgentComposer / AgentWorkbench 结构
- 不新增外部 npm 依赖
- 不修改 SSE 协议（仅扩展 meta/done 中的 AgentChatResponse 字段）

## 6. 文件清单

| # | 文件 | 操作 |
|---|------|------|
| 1 | `src/components/dashboard/DashboardIconBar.tsx` | 修改 |
| 2 | `src/components/dashboard/agent/MessageCard.tsx` | 修改 |
| 3 | `src/components/dashboard/agent/AgentConversation.tsx` | 修改 |
| 4 | `src/components/dashboard/DashboardRightPanel.tsx`（LinkedObjectsPanel） | 修改 |
| 5 | `src/lib/agent/schemas.ts`（AgentChatResponse + affectedDocuments） | 修改 |
| 6 | `src/lib/agent/chat-pipeline/execute-and-persist-step.ts` | 修改 |
| 7 | `src/lib/agent/chat-pipeline/dry-run-and-propose-step.ts` | 修改 |
| 8 | `tests/agent/dashboard-panel-search.test.ts` | 新建 |
| 9 | `tests/agent/dashboard-thinking-fold.test.ts` | 新建 |
| 10 | `src/app/styles/sunny-agent.css` | 修改 |
