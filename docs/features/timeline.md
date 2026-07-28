# Feature: Timeline

## Scope

- timeline event draft
- project progress records
- review nodes
- public timeline display
- related Plan / Checklist / Schedule / Content links
- private completion activity in Dashboard

## Rules

- public event 可展示在 `/timeline`
- private event 不展示
- 创建 event 必须确认
- timeline write 必须生成 receipt
- Schedule / Checklist completion TimelineEvent 由确定性业务服务生成
- completion event 可记录 `relatedPlan`、`relatedChecklist`、
  `relatedScheduleItem` 和稳定的 `relatedTaskKey`
- private completion event 只显示在已授权 Dashboard，不进入 public `/timeline`
- Dashboard 使用共享关联组件打开精确 Plan、Checklist 或 Schedule
- 完成回滚会删除本次新增事件并清理 Plan.linkedContent，不保留悬空链接

## Non-goals

- 自动抓取外部事件
- 展示 private Schedule
- 未确认自动记录
