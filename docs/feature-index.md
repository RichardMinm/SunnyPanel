# Feature Index

## 1. Priority Rules

### P0

- v1 必须稳定
- 不应随意删除
- 不应弱化测试
- 不应被 P1 / P2 抢优先级

### P1

- 用于 Demo、展示、体验增强
- 可以逐步打磨
- 不应破坏 P0

### P2

- 后续增强
- 不应在 P0 / P1 稳定前优先开发

### Not in v1

- 当前阶段不实现
- 除非重新打开产品范围

---

## 2. Public Site Features

### P0

#### Home

Scope:

- 公开首页
- 精选公开内容
- Blog / Notes / Timeline / About 入口
- 最新 Blog
- 最新 Notes
- Timeline 摘要

Rules:

- 不展示 Agent Workbench
- 不展示私有 Dashboard 状态
- 不提供写入操作
- 不写产品介绍型文案

#### Blog

Scope:

- Blog list
- Blog detail
- title / summary / publishedAt / category / tags
- 阅读排版
- 代码块、引用、图片渲染

Rules:

- 只展示 published + public
- 不公开编辑
- 不触发 Agent execute
- 不暴露 private draft

#### Notes

Scope:

- Notes list
- Note detail
- short-form 内容展示
- tags 展示

Rules:

- Updates 合并到 Notes 或 Timeline
- 不暴露 private memory
- 不展示私有 workflow 状态

#### Timeline

Scope:

- public timeline events
- chronological display
- project progress display

Rules:

- 不自动抓取外部事件
- 不展示 private schedule
- 不执行未确认的 Agent 写入

#### About

Scope:

- About
- Now
- selected links
- project summary if needed

Rules:

- 不做完整简历系统
- 不做多身份 profile 系统
- 不写宣传式介绍

#### Tag / Category Browsing

Scope:

- `/tags/[slug]`
- `/categories/[slug]`
- tags / categories 展示
- published + public 内容筛选

Rules:

- Public Site 只展示和筛选
- tags / categories 管理在 Writing
- private 内容不得出现
- draft 内容不得出现

### Removed from Public Site

- Updates
- Checklists
- Schedule
- Planning
- Agent Workbench
- Agent Ops / Trace

---

## 3. Dashboard Features

### P0

#### Agent Workbench

Scope:

- chat-style interaction
- read intent handling
- write intent draft generation
- pending confirmation display
- execution result display
- receipt display

Rules:

- 不允许未确认直接写数据库
- 不允许完全自主执行
- 不展示真实 Chain-of-Thought
- 不展示 raw prompt / raw LLM response / secret

Protected boundaries:

- Agent pipeline
- Executor
- Policy Guard
- Receipt
- Rollback

#### Writing

Scope:

- Blog / Notes drafts
- editor
- metadata inspector
- category / tags
- preview
- publish / unpublish
- view public page

Rules:

- 不允许未确认自动发布
- 不允许未确认批量改写已发布内容
- 不新增独立 Public Manager
- v1 不新增独立 Taxonomy Manager

#### Planning

Scope:

- Plan list
- Plan detail
- plan status
- plan progress
- linked checklist
- linked schedule
- activity / receipt

Rules:

- Planning 是目标层
- Checklist 是任务拆解层
- Schedule 是时间分配层
- 不做自动重排

#### Checklist

Scope:

- checklist draft generation
- checklist item tracking
- plan-linked checklist
- user confirmation before create
- local receipt
- local rollback if supported

Rules:

- 不作为公开站点栏目
- 查询 checklist 不进入写入流程
- 未确认不得创建 checklist
- 不删除 checklist workflow tests

#### Schedule

Scope:

- schedule draft generation
- standalone schedule
- plan-backed schedule
- basic time parsing
- deterministic conflict detection
- LLM suggestion
- user confirmation before write
- local receipt

Rules:

- 不接外部日历写入
- 不承诺外部日历 rollback
- 不做自动重排

#### Timeline

Scope:

- timeline event draft
- user confirmation before write
- public timeline display when marked public

Rules:

- 不自动抓取外部事件
- 不执行未确认 timeline write

### P1

#### Agent Activity

Scope:

- structured activity states
- progress display
- receipt status
- rollback availability

Rules:

- 不展示真实 Chain-of-Thought
- 不展示 raw prompt
- 不展示 raw LLM response
- 不展示 secret
- 动画只展示状态变化，不伪造进度

#### Developer Trace Panel

Scope:

- sanitized trace view
- structured event timeline
- payload summary

Rules:

- 不展示 raw secrets
- 不展示 Authorization header
- 不展示 Cookie
- 不展示未脱敏大 payload

#### Inspector

Scope:

- selected item metadata
- draft preview
- confirmation summary
- receipt summary
- trace summary

Rules:

- 不作为独立 workflow engine
- 不绕过 Agent 工作流执行操作

#### Design System

Scope:

- base UI components
- layout components
- design tokens
- motion rules
- copywriting rules

Rules:

- 不新增零散 token
- 不重复实现基础组件
- 不引入多套动画库
- 不写产品介绍型 UI 文案

### P2

#### Memory View

Scope:

- structured memory summary
- reviewable memory later

Rules:

- 不做无感后台画像
- 不展示未经授权的个人数据
- 不自动收集外部隐私数据

#### Search

Scope:

- keyword search
- content filtering

Rules:

- v1 不做复杂语义搜索
- v1 不做跨外部系统搜索

#### Demo Polish

Scope:

- empty states
- loading states
- visual hierarchy
- demo data

Rules:

- 不扩展新的核心工作流
- 不大规模重构

---

## 4. Agent Workflow Features

### P0

- Read / Write Boundary
- Draft
- Dry-run
- Policy Guard
- Pending Confirmation
- Execute
- Receipt
- Rollback

Rules:

- read intent 不进入 write flow
- write intent 不直接 execute
- draft 不持久化数据
- dry-run 不持久化数据
- Policy Guard failure 阻止 confirmation
- execute 依赖用户确认
- execute success 创建 receipt
- rollback support 必须显式声明

### P1

- Agent Activity state display
- Developer Trace Panel
- Receipt UI
- Rollback availability UI

### Not in v1

- 未确认自主多步执行
- 高风险外部系统写入
- 外部日历 rollback
- 企业级审计合规
- 分布式事务
- 多用户审批流
