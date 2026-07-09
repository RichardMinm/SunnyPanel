# Planning Execution Lifecycle

## 1. Model

```txt
Plan
→ Checklist
→ ChecklistItem
→ ScheduleItem
→ Completion
→ Plan Progress
```

---

## 2. Module Roles

### Planning

Responsibilities:

- 创建计划
- 描述目标
- 定义阶段
- 关联任务清单
- 查看计划进度
- 查看计划相关日程
- 查看计划执行状态

Non-goals:

- 直接绕过确认写入
- 自动执行计划
- 自动重排所有任务

### Checklist

Responsibilities:

- 承载计划拆解后的任务列表
- 跟踪任务状态
- 支持任务完成反馈
- 为 Plan Progress 提供基础数据

Non-goals:

- 公开站点展示
- 未确认自动创建
- 替代 Schedule 进行时间安排

### Schedule

Responsibilities:

- 将任务安排到具体时间
- 展示计划相关日程
- 检查基础时间冲突
- 支持日程草案确认后写入

Non-goals:

- 外部日历写入
- 外部日历 rollback
- 自动日程重排
- 未确认自动创建日程

---

## 3. Relationship Rules

- Plan 可以关联多个 Checklist
- Checklist 可以关联一个 Plan
- ChecklistItem 可以关联一个 Plan
- ScheduleItem 可以独立存在
- ScheduleItem 可以关联 Plan
- ScheduleItem 可以关联 ChecklistItem

Recommended relationship:

```txt
Plan
  └── Checklist
        └── ChecklistItem
              └── ScheduleItem
```

---

## 4. Schedule Types

### Standalone Schedule

Examples:

- 开会
- 健身
- 就医
- 生活提醒

Rules:

- 不强制关联 Plan
- 不强制关联 ChecklistItem

### Plan-backed Schedule

Examples:

- 完成简历初稿
- 复盘项目
- 整理 Demo Script

Rules:

- 可关联 Plan
- 可关联 ChecklistItem
- 完成后可反馈 Plan Progress

---

## 5. Conflict Handling

Flow:

```txt
Read existing ScheduleItems
→ Run deterministic conflict detection
→ Generate conflict summary
→ LLM proposes resolution options
→ User reviews options
→ Pending Confirmation
→ Execute selected option
→ Receipt
```

Rules:

- 冲突检测应由确定性逻辑完成
- LLM 不作为唯一冲突判断来源
- LLM 可以解释冲突
- LLM 可以生成替代时间建议
- 用户确认前不得创建、移动、删除日程

---

## 6. Plan Detail Layout

Recommended structure:

```txt
Plan Detail
├── Overview
├── Checklist
├── Schedule
├── Progress
├── Agent Suggestions
└── Activity / Receipt
```

Overview:

- title
- goal
- status
- time range
- progress
- current stage

Checklist:

- todo
- doing
- done
- unscheduled tasks
- scheduled tasks

Schedule:

- related schedule items
- unscheduled tasks
- conflicts
- suggested allocation

Progress:

- completed item count
- total item count
- completion ratio
- recent completed items

Activity / Receipt:

- created plan
- generated checklist
- scheduled tasks
- completed items
- receipt
- rollback status

---

## 7. V1 Scope

Supports:

- Plan 关联 Checklist (via Checklist.planId + Plan.linkedContent)
- ChecklistItem 关联 ScheduleItem (via relatedChecklistItemKey)
- Plan Detail 展示 checklist / schedule / progress
- 基础时间冲突检查 (deterministic)
- LLM 生成日程分配建议
- 用户确认后写入本地 schedule
- ChecklistItem 完成后反馈 Plan.progress (afterChange hook, auto-sync)
- Rollback 时清理 Plan.linkedContent 中的 schedule-items 链接
- Receipt 和 Rollback payload 覆盖所有写入操作

Not supported:

- 自动日程重排
- 外部 Calendar 写入
- 外部 Calendar rollback
- 多用户协作
- 多人审批
- 复杂任务依赖图
- 甘特图
- 企业级项目管理
- 完全自主执行 Agent
- ChecklistItem 独立 collection (v1 保持嵌入式)
- TimelineEvent.relatedPlan (D2-A3b deferred)
- 旧数据 planId backfill

---

## 8. Implementation Status (Phase D2)

| Capability | Status | Phase |
|-----------|--------|-------|
| Checklist.planId (→ plans) | ✅ Implemented | D2-A1 |
| create_checklist writes planId | ✅ Implemented | D2-A1 |
| Plan.linkedContent preserves checklist links | ✅ Implemented | Pre-existing |
| Plan.progress auto-sync (afterChange hook) | ✅ Implemented | D2-A2 |
| ScheduleItem → Plan.linkedContent | ✅ Implemented | D2-A3a |
| Rollback cleanup Plan.linkedContent | ✅ Implemented | D2-A3a-fix |
| create_schedule_items rollback fail-fast | ✅ Implemented | D2-A3a-fix-test |
| Protected tests coverage | ✅ 270 planning + 268 schedule | D2-S |
| TimelineEvent.relatedPlan | ⏳ Deferred | D2-A3b |
