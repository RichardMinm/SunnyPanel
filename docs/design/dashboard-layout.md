# Dashboard Layout

## 1. Shell

Recommended structure:

```txt
DashboardShell
├── Sidebar
├── Topbar / WorkspaceHeader
├── Main Workspace
└── InspectorPanel
```

Rules:

- Sidebar 负责模块导航
- Main Workspace 负责主任务
- InspectorPanel 负责上下文详情
- Agent Activity 可作为右侧或底部状态区域
- 不在每个页面重复实现 shell

---

## 2. Module Navigation

P0 modules:

- Writing
- Planning
- Checklist
- Schedule
- Timeline
- Agent Workbench

P1 modules:

- Agent Activity
- Developer Trace
- Inspector

Rules:

- Planning / Checklist / Schedule 是不同视角，不是完全孤立模块
- Public Site 管理不作为独立 Dashboard 模块
- Taxonomy v1 不作为独立模块

---

## 3. Writing Layout

```txt
Writing
├── Content List
├── Editor
└── Inspector
    ├── Type
    ├── Status
    ├── Visibility
    ├── Slug
    ├── Category
    ├── Tags
    ├── Preview
    ├── Publish / Unpublish
    └── View Public Page
```

Rules:

- Writing 是内容生产与 metadata 管理中心
- 不新增 Public Manager

---

## 4. Plan Detail Layout

```txt
Plan Detail
├── Overview
├── Checklist
├── Schedule
├── Progress
├── Agent Suggestions
└── Activity / Receipt
```

Rules:

- Checklist 和 Schedule 在计划详情中联动展示
- 冲突建议必须等待用户确认
- 不自动重排

---

## 5. Agent Workbench Layout

```txt
Agent Workbench
├── Conversation
├── Draft Preview
├── Dry-run Result
├── Pending Confirmation
├── Receipt
└── Activity / Trace
```

Rules:

- 写入类 action 显示 draft / dry-run / confirmation
- 查询类 action 不显示 pending confirmation
- 不展示 raw prompt / hidden reasoning
