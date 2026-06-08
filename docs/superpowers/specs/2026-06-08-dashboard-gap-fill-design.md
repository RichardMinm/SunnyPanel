# Dashboard 功能缺失修补 · 设计文档

**日期**: 2026-06-08
**状态**: 已批准
**范围**: Dashboard 前端修补，不新增后端 API

---

## 一、背景与目标

基于 Dashboard 功能与后端对应评估（2026-06-08），识别出 7 类缺口。核心对话管道和审批流程已完全对齐，但 Sidebar 辅助功能、Quick Actions、内容视图存在缺失。

**目标**：将所有已识别缺口分两阶段修补，全部使用已有后端 API，所有新增图标使用本地 SVG。

### 修补范围

| # | 修补项 | 阶段 | 预估改动 |
|---|--------|------|----------|
| 1 | Sidebar 建议区展示 | Phase 1 | ~80 行 |
| 2 | Quick Actions 分级子菜单 | Phase 1 | ~60 行 |
| 3 | Timeline 模式接入 Composer | Phase 1 | ~10 行 |
| 4 | 分域搜索（3 个搜索域） | Phase 1 | ~30 行 |
| 5 | PlanReview 卡片 + Inspector Tab | Phase 2 | ~150 行 |
| 6 | Checklist + Timeline 独立视图 | Phase 2 | ~200 行 |
| 7 | Memory Inspector 面板正常化 | Phase 2 | ~30 行 |

---

## 二、架构约束

- **不新增后端 API**：所有功能使用已有路由和 Payload collections
- **本地 SVG 图标**：`DashboardIconName` 和 `ICON_PATHS` 在 `icons.tsx` 中扩展
- **组件模式**：延续现有 `schedule`/`memory` 独立视图模式（Sidebar 切换 → MainWorkspace 替换）
- **样式策略**：延续现有 CSS 文件体系（`sunny-dashboard-*.css`），新增组件复用现有类名

---

## 三、Phase 1 — 低成本接线（4 项）

### 3.1 Sidebar 建议区

**组件**: `DashboardIconBar.tsx` — 新增建议 section

**行为**:
- 页面加载时调用 `GET /api/agent/suggestions`（后端已有 `syncAgentSuggestionsFromWorkspaceSnapshot` 在 `loadDashboardData` 中运行，改为将数据返回给前端）
- 显示动态建议列表（标题 + accept ✓ / dismiss ✕ 按钮）
- 接受 → 以预设 prompt 填入 Composer → 调用 `PATCH /api/agent/suggestions { action: "accept" }`
- 忽略 → 调用 `PATCH /api/agent/suggestions { action: "dismiss" }`
- 无动态建议时显示静态快捷入口列表（`/plan`、`/schedule`、`/review` 等 slash commands）
- 显示建议数量 badge（如「建议 (3)」）

**后端数据流**:
```
loadDashboardData() → syncAgentSuggestionsFromWorkspaceSnapshot()
→ 返回 suggestions 给前端
→ DashboardIconBar 渲染
```

### 3.2 Quick Actions 分级子菜单

**组件**: `AgentComposer.tsx` — `+` 按钮展开

**菜单结构**（2 级，从当前 5 个占位按钮演化）:
```
+ 按钮（点击展开一级菜单）
├── 📄 引用上下文 ▸
│   ├── 当前计划
│   ├── 最近日程
│   ├── 关联清单
│   └── 相关记忆
├── 📋 添加计划 ▸
│   ├── 起草新计划
│   └── 关联当前计划
├── 🧠 添加记忆 ▸
│   ├── 偏好/习惯
│   ├── 项目上下文
│   └── 工作流规则
├── 📎 添加文件
└── / 斜杠命令
```

**行为**:
- 一级菜单项带 ▸ 的展开二级子菜单（缩进 + 左边框）
- 选择上下文来源 → 在 Composer 输入框中插入 `@引用标记`
- 选择计划/记忆操作 → 填入对应 slash command
- 添加文件 → 触发文件选择对话框
- 斜杠命令 → 展示可用 slash commands 列表
- 点击菜单外区域关闭

### 3.3 Timeline 模式接入

**涉及文件**: `AgentComposer.tsx`、`DashboardShell.tsx`、`AgentWorkbenchMode`（已有类型包含 `timeline`）

**改动**:
1. `AgentComposer.tsx` `MODE_OPTIONS` 数组新增一项:
   ```ts
   { key: "timeline", label: "时间线", description: "记录或查询时间线事件，默认不会写入。", placeholder: "描述要记录的时间线事件或查询条件" }
   ```
2. `DashboardShell.tsx` `iconModeToWorkbenchMode` 新增:
   ```ts
   timeline: "timeline"
   ```
3. `ThreadHeader.tsx` 在 `workbenchMode === "timeline"` 时显示对应 badge

### 3.4 分域搜索

**3 个独立的搜索域，互不干扰**:

| 域 | 位置 | 搜索范围 | 实现方式 |
|----|------|----------|----------|
| 线程搜索 | Sidebar 搜索框（已有） | 线程 title + tags | 本地过滤（`filterDashboardThreads`，已实现） |
| 关联搜索 | Inspector 顶部搜索框（新增） | 跨集合：plans/schedule-items/notes/memories/checklists | Payload local API `find()`，按类型分组展示 |
| @mention | Composer 输入框中键入 `@`（新增） | 同上 | 下拉浮层，点击后插入引用标签 |

**Inspector 关联搜索结果格式**:
```ts
{ collection: string; id: number; title: string; type: string; }[]
// 按 collection 分组，点击跳转对应 Admin/公开页面
```

---

## 四、Phase 2 — 新视图（3 项）

### 4.1 PlanReview 复盘卡片 + Inspector Tab

**组件**:
- 新建 `AgentReviewCard.tsx` — 对话流中的复盘摘要卡片
- 修改 `DashboardRightPanel.tsx` — 新增 Review tab
- 修改 `agent/constants.ts` — `inspectorTabs` 数组新增 `{ key: "review", label: "复盘" }`

**ReviewResultCard 字段**（对话中内联卡片）:
```ts
{
  planTitle: string;
  week: string;                    // "2026-W23"
  completedItems: string[];        // 完成项
  incompleteItems: string[];       // 未完成
  risks: string[];                 // 风险/阻塞
  suggestions: string[];           // 建议调整
  progressSummary: string;         // 整体进展描述
  planId: number;
}
```

**Inspector Review Tab 内容**:
- 当前计划的历史复盘列表（按时间倒序）
- 点击展开完整详情（进度描述 + 完成/未完成列表 + 建议）
- 「生成新复盘」按钮 → 触发 `POST /api/agent/evaluate`

**数据来源**:
- 当前对话的 review 结果 → `AgentChatResponse.pendingAction.reviewResult`
- 历史复盘 → `GET /api/agent/evaluate?planId=xxx`
- 持久化 → Payload `plan-reviews` collection

### 4.2 Checklist + Timeline 独立视图

**模式**: 延续 `ScheduleMonthView` / `MemoryCardGrid` 的 Sidebar 切换 → MainWorkspace 替换模式

**ChecklistView** (`src/components/dashboard/checklist/ChecklistView.tsx`):
- Sidebar 注册新工作区项: `{ key: "checklist", label: "清单", icon: "checklist", prompt: "" }`
- 筛选栏: 全部 / 进行中 / 已完成 / 已归档
- 清单卡片: 标题 + 关联计划 + 状态 badge + 进度条 + 可展开项列表
  - ✓ 完成项（绿色 + 删除线）
  - ○ 待办项（灰色）
- 点击清单项 → 填入 Composer prompt: "帮我推进这个清单"
- 数据来源: Payload `checklists` collection（local API，按 status + relatedPlan + 关键词复合过滤）
- 新增图标: `DashboardIconName` 已有 `"checklist"`

**TimelineView** (`src/components/dashboard/timeline/TimelineView.tsx`):
- Sidebar 注册新工作区项: `{ key: "timeline", label: "时间线", icon: "timeline", prompt: "" }`
- 垂直时间轴 + 事件节点
  - 里程碑 🟢
  - 项目更新 ⚪
  - 风险记录 🟡
- 按月筛选（月份选择器）
- 数据来源: Payload `timeline-events` collection
- 新增图标: `DashboardIconName` 已有 `"timeline"`

**Notes / Posts**:
- 轻量查阅 → Inspector「关联」tab 已展示 `affectedDocuments` 中的 notes/posts
- 深度管理 → 走独立页面 `/notes` 和 `/blog`
- 不新增 Dashboard 子视图

### 4.3 Memory Inspector 面板正常化

**问题**: `MemoryInspectorPanel` 当前仅在 `debugMode` 时显示内容，正常模式显示"调试开启后会显示"

**修复**:
- 正常模式下从 `traceSteps` 解析 `kind === "context"` 的记忆命中记录
- 展示本轮使用的记忆列表：内容摘要 + 类型（偏好/项目上下文/工作流规则/写作风格） + 置信度 + 最近使用时间
- Debug 模式额外显示：原始搜索关键词和匹配详情

---

## 五、文件变更清单

### Phase 1
| 文件 | 操作 | 说明 |
|------|------|------|
| `src/components/dashboard/DashboardIconBar.tsx` | 修改 | 新增建议 section + 完善搜索 |
| `src/components/dashboard/agent/AgentComposer.tsx` | 修改 | Quick Actions 分级菜单 + Timeline 模式 |
| `src/components/dashboard/DashboardShell.tsx` | 修改 | iconModeToWorkbenchMode 新增 timeline 映射 |
| `src/components/dashboard/DashboardRightPanel.tsx` | 修改 | Inspector 新增关联搜索框 |
| `src/lib/dashboard/load-dashboard-data.ts` | 修改 | 返回 suggestions 给前端 |

### Phase 2
| 文件 | 操作 | 说明 |
|------|------|------|
| `src/components/dashboard/agent/AgentReviewCard.tsx` | **新建** | 复盘摘要卡片 |
| `src/components/dashboard/agent/AgentReviewPanel.tsx` | **新建** | Inspector Review tab 内容 |
| `src/components/dashboard/checklist/ChecklistView.tsx` | **新建** | 清单独立视图 |
| `src/components/dashboard/timeline/TimelineView.tsx` | **新建** | 时间线独立视图 |
| `src/components/dashboard/agent/constants.ts` | 修改 | inspectorTabs 新增 review |
| `src/components/dashboard/DashboardRightPanel.tsx` | 修改 | Review tab 接入 |
| `src/components/dashboard/DashboardShell.tsx` | 修改 | Sidebar + MainWorkspace 路由 |
| `src/components/dashboard/DashboardIconBar.tsx` | 修改 | 新增 checklist/timeline 工作区项 |
| `src/components/dashboard/icons.tsx` | 修改 | `DashboardIconName` 新增 review 等图标 |

---

## 六、图标扩展

所有新增图标在 `icons.tsx` 中扩展：

```ts
// DashboardIconName 新增:
| "review"

// ICON_PATHS 新增:
review: (
  <path d="..." />  // 复盘/分析图标
)

// COLLECTION_ICON_MAP 新增:
"plan-reviews": "review"
```

不引入任何外部图标库，所有图标为本地 inline SVG。

---

## 七、不变更的范围

- 后端 API 和 Payload collections（不新增、不修改）
- 数据库 schema
- 多用户协作
- Agent 管道逻辑
- Payload Admin 面板
- 独立页面路由（`/notes`、`/blog`、`/timeline` 等保持不变）

---

## 八、验收标准

1. Sidebar 显示建议列表，可接受/忽略
2. Composer `+` 按钮展开分级子菜单，可导航到具体操作
3. Composer 模式选择器包含"时间线"
4. Sidebar 搜索过滤线程，Inspector 搜索跨集合，Composer `@` 触发上下文搜索
5. 复盘结果以结构化卡片展示在对话和 Inspector 中
6. 清单和时间线有独立视图
7. Memory 面板正常模式有内容
8. 所有新增图标使用本地 SVG
