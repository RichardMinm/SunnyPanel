# Feature: Schedule

## Scope

- standalone schedule
- plan-backed schedule
- schedule draft generation
- basic time parsing
- deterministic conflict detection
- LLM conflict explanation
- user confirmation before write
- local receipt

## Schedule Types

Standalone:

- 不强制关联 Plan
- 不强制关联 ChecklistItem

Plan-backed:

- 可关联 Plan
- 可关联 ChecklistItem
- 完成后反馈 Plan Progress

## Conflict Flow

```txt
Read existing ScheduleItems
→ Deterministic conflict detection
→ Conflict summary
→ LLM resolution options
→ User review
→ Pending Confirmation
→ Execute
→ Receipt
```

## Rules

- LLM 不作为唯一冲突检测来源
- 用户确认前不得创建日程
- 用户确认前不得移动日程
- 用户确认前不得删除日程

## Non-goals

- 外部日历写入
- 外部日历 rollback
- 自动重排
