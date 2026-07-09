# Product Map

## 1. Surface Scope

### Public Site

Routes:

- `/`
- `/blog`
- `/blog/[slug]`
- `/notes`
- `/notes/[slug]`
- `/timeline`
- `/about`
- `/tags/[slug]`
- `/categories/[slug]`

Responsibilities:

- 展示公开内容
- 展示 Blog
- 展示 Notes
- 展示 Timeline
- 展示 About
- 展示 tags / categories 浏览结果
- 展示 published + public 内容

Rules:

- 只展示 `status = published`
- 只展示 `visibility = public`
- 不展示 private 内容
- 不展示 draft 内容
- 不承载写入操作
- 不承载 Agent Workbench
- 不承载 confirmation / rollback / receipt UI
- tags / categories 只用于公开内容浏览和筛选

Non-goals:

- 不做 Updates 独立栏目
- 不做 Checklists 公开栏目
- 不做 Schedule 公开栏目
- 不做 Planning 公开栏目
- 不做 Public 管理后台
- 不做 Agent Ops / Trace 公开展示

### Dashboard

Modules:

- Writing
- Planning
- Checklist
- Schedule
- Timeline
- Memory
- Inspector
- Agent Workbench
- Agent Ops / Trace

Responsibilities:

- 管理私有内容
- 管理内容发布状态
- 管理内容 metadata
- 执行 Agent confirmation flow
- 展示 pending confirmation
- 展示 receipt
- 展示 rollback 状态
- 展示 Agent Activity / Trace

Rules:

- Dashboard 承载写入确认和执行入口
- Dashboard 内部功能不得直接暴露到 Public Site
- Dashboard 中的写入类操作必须经过安全链路

### Agent Workbench

Responsibilities:

- 承接自然语言请求
- 分类 read / write intent
- 生成 draft
- 触发 dry-run
- 触发 Policy Guard
- 创建 pending confirmation
- 用户确认后 execute
- execute 后生成 receipt
- 可回滚操作显示 rollback 状态

Rules:

- 不直接写数据库
- 不跳过 confirmation
- 不展示真实 Chain-of-Thought
- 不展示 raw prompt
- 不展示 raw LLM response
- 不展示 secret

---

## 2. Core Modules

### Writing

Responsibilities:

- 管理 Blog / Notes 内容
- 管理内容草稿
- 管理发布状态
- 管理公开展示 metadata
- 提供编辑器
- 提供 Preview Public Page
- 提供 Publish / Unpublish
- 提供 View Public Page

Metadata:

- title
- slug
- summary
- coverImage
- content
- contentFormat
- editorJson?
- type: `blog | note`
- status: `draft | published | archived`
- visibility: `private | public`
- category
- tags
- publishedAt
- updatedAt

Rules:

- canonical content 优先使用 Markdown / MDX-like text
- editor JSON 可作为辅助结构
- rendered HTML 不作为唯一数据源
- tags / categories 通过 Writing Inspector 管理
- v1 不新增独立 Tags Manager
- v1 不新增独立 Categories Manager
- 不直接复制受限第三方代码
- 复用第三方代码必须保留 license / attribution

Non-goals:

- 未确认自动发布
- 自动批量改写已发布内容
- 独立 Public 管理后台
- v1 独立 Taxonomy 管理后台
- 实时多人协作
- 完整 Notion-like 编辑器

### Planning

Responsibilities:

- 作为计划入口
- 承载目标、阶段、进度
- 关联 Checklist
- 关联 Schedule
- 展示计划执行状态

Rules:

- Planning 是目标层
- Checklist 是任务拆解层
- Schedule 是时间分配层
- Completion 反馈 Plan Progress
- LLM 可生成方案，不直接决断执行

Non-goals:

- 自动执行计划
- 自动重排任务
- 甘特图
- 企业级项目管理

### Checklist

Responsibilities:

- 承载任务列表
- 管理 ChecklistItem
- 支持任务完成状态
- 支持计划任务拆解
- 向 Plan Progress 反馈完成情况

Rules:

- 可以关联 Plan
- ChecklistItem 可作为 v1 任务原子
- 查询 checklist 不进入写入流程
- 创建 checklist 必须走 confirmation flow

Non-goals:

- 公开站点展示
- 未确认直接创建
- 删除 protected workflow tests

### Schedule

Responsibilities:

- 管理本地日程项
- 支持计划型日程
- 支持独立日程
- 支持基础时间冲突检查
- 支持任务分配到时间

Rules:

- ScheduleItem 可独立存在
- ScheduleItem 可关联 Plan / ChecklistItem
- 冲突检测优先由确定性逻辑完成
- LLM 解释冲突并生成候选方案
- 用户确认后才写入

Non-goals:

- 外部日历写入
- 外部日历 rollback
- 自动日程重排

### Timeline

Responsibilities:

- 管理时间线事件
- 展示公开时间线
- 记录项目进展
- 记录复盘节点

Rules:

- public timeline event 可展示在 Public Site
- private timeline event 不展示
- 创建 timeline event 必须走 confirmation flow

Non-goals:

- 自动抓取外部事件
- 展示私有 Schedule

### Taxonomy

Responsibilities:

- 支持内容按 category / tags 组织
- 支持 Public Site tags / categories 浏览

v1 Scope:

- Blog / Notes 绑定 category
- Blog / Notes 绑定 tags
- Public Site 展示 category / tags
- Public Site 按 category / tags 筛选 published + public 内容

Rules:

- tags / categories 由 Dashboard / Writing 管理
- Public Site 只展示和筛选
- 未发布内容的 tags / categories 不进入公开页面
- private 内容不进入公开 tag / category 页面

Non-goals:

- 独立 Tags Manager
- 独立 Categories Manager
- 标签合并
- 分类层级
- 分类 SEO 管理
- 标签批量清理
- 分类 slug 重命名迁移

---

## 3. Content Lifecycle

Flow:

```txt
Dashboard / Writing
→ Create Draft
→ Edit Content
→ Set Metadata
→ Set Category / Tags
→ Preview
→ Publish
→ Public Site Display
```

States:

- draft
- published
- archived

Visibility:

- private
- public

Rules:

- draft 不进入 Public Site
- private 不进入 Public Site
- published + public 才能公开展示
- Blog 展示在 `/blog`
- Notes 展示在 `/notes`
- public TimelineEvent 展示在 `/timeline`
- tags / categories 只筛选 published + public 内容

---

## 4. Agent Workflow

Read Intent:

```txt
User Input
→ Intent Router
→ Read Boundary
→ Query
→ Summarize
→ Response
```

Rules:

- 不生成 draft
- 不进入 confirmation
- 不写数据库
- 不生成 write receipt

Write Intent:

```txt
User Input
→ Intent Router
→ Write Boundary
→ Draft
→ Dry-run
→ Policy Guard
→ Pending Confirmation
→ Execute
→ Receipt
→ Rollback if supported
```

Rules:

- Draft 不写数据库
- Dry-run 不写数据库
- Policy Guard 失败不得进入 confirmation
- 用户确认前不得 execute
- Execute 后必须生成 receipt
- 支持 rollback 的操作必须声明 rollback 策略

---

## 5. Product Priority

### P0

- Public Site 基础展示
- Dashboard 基础布局
- Design tokens
- Base UI components
- Writing
- Blog / Notes 发布流
- Content metadata
- Public tag / category 展示
- Planning / Checklist / Schedule 基础联动
- Agent Workbench
- Read / Write Boundary
- Draft
- Dry-run
- Policy Guard
- Pending Confirmation
- Execute
- Receipt
- Rollback
- Timeline

### P1

- Agent Activity
- Developer Trace Panel
- Dashboard Inspector
- Public Timeline
- Blog / Notes 内容展示
- About / Now 页面
- Public tag / category 筛选体验
- Preview Public Page
- View Public Page
- 基础 motion system
- Empty / loading / error states

### P2

- Search
- 内容过滤增强
- Writing 体验优化
- Memory 展示
- Demo polish
- Writing / Taxonomy 管理页
- 标签合并
- 分类层级
- 分类描述与排序
- Storybook
- 组件文档
- 高级主题系统

### Not in v1

- 多用户协作
- 多租户
- 外部 Calendar 写入
- 外部 Calendar rollback
- 自动日程重排
- 企业审计系统
- 高风险自动执行
- 复杂权限系统
- 公开 Checklists 栏目
- 独立 Updates 栏目
- 独立 Public 管理后台
- 独立 Tags Manager
- 独立 Categories Manager
- raw Chain-of-Thought 展示
- raw prompt 展示
- raw LLM response 展示

---

## 6. UI Copy Rules

Rules:

- 产品界面不写介绍型文案
- 产品界面不写宣传型文案
- 产品界面不写愿景型文案
- 使用状态、动作、对象、结果
- Agent 状态文案必须对应结构化状态
- 不使用 “第二大脑 / 赋能 / 智能化平台 / 欢迎来到 / 致力于” 等表达
