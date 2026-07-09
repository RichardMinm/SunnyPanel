# Feature: Planning

## Scope

- Plan list
- Plan detail
- Plan status
- Plan progress
- linked checklist
- linked schedule
- activity / receipt

## Role

- Planning 是目标层
- Checklist 是任务拆解层
- Schedule 是时间分配层
- Completion 反馈 Plan Progress

## Flow

```txt
Create Plan Draft
→ Dry-run
→ Policy Guard
→ Pending Confirmation
→ Execute
→ Receipt
```

## Plan Detail

- Overview
- Checklist
- Schedule
- Progress
- Agent Suggestions
- Activity / Receipt

## Rules

- Plan 可关联 Checklist
- ChecklistItem 可关联 ScheduleItem
- ScheduleItem 可独立存在
- ScheduleItem 可关联 Plan / ChecklistItem
- LLM 只生成建议，不直接执行

## Non-goals

- 自动日程重排
- 甘特图
- 企业级项目管理
- 多人审批
