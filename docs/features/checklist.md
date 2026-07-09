# Feature: Checklist

## Scope

- checklist draft generation
- checklist item tracking
- plan-linked checklist
- local receipt
- local rollback if supported

## Rules

- Checklist 可以独立存在
- Checklist 可以关联 Plan
- ChecklistItem 是 v1 任务原子
- 查询 checklist 不进入写入流程
- 创建 checklist 必须确认

## Flow

```txt
User Input
→ Checklist Draft
→ Dry-run
→ Policy Guard
→ Pending Confirmation
→ Execute
→ Receipt
```

## Non-goals

- Public Site 展示
- 未确认直接创建
- 删除 checklist workflow tests
