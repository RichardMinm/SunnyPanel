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
- linked completion propagation
- server-owned rollback

## Schedule Types

Standalone:

- 不强制关联 Plan
- 不强制关联 ChecklistItem

Plan-backed:

- 可关联 Plan
- 可通过 `relatedChecklist` + `relatedChecklistItemKey` 精确关联 ChecklistItem
- 完成后同步 ChecklistItem、Plan Progress 和私有 TimelineEvent
- 完成 TimelineEvent 可同时关联 Plan、Checklist 和 ScheduleItem

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
- 手动 UI 与 Agent 确认完成共用同一事务服务
- Agent 精确完成请求仍必须先生成 Dry-run 并确认
- 客户端回滚只提交 `sourceRunId`，不提交可执行 rollback payload
- 回滚恢复 Schedule / Checklist / Plan 并移除本次完成 Timeline
- Dashboard 完成与回滚通过受影响文档事件刷新已加载视图

## Non-goals

- 外部日历写入
- 外部日历 rollback
- 自动重排
