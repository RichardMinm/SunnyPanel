# Safety Model

## 1. Write Safety Rules

- 理解用户意图不等于执行
- 生成草案不等于写数据库
- 用户认可草案不等于最终执行
- 确认后执行不等于不可回滚
- 查询类意图不得进入写入链路
- 写入类意图必须经过 Draft / Dry-run / Policy Guard / Pending Confirmation
- Execute 后必须有 Receipt
- 可回滚操作必须有 rollback 策略

---

## 2. Data Safety Rules

- Public Site 不展示 private 内容
- Public Site 不展示 draft 内容
- Public Site 只展示 published + public
- Agent Activity 不展示 raw hidden reasoning
- Agent Activity 不展示 raw prompt
- Agent Activity 不展示 raw LLM response
- Trace 不展示 secrets
- Receipt 不记录 secrets
- rollback 不承诺外部系统一致性

---

## 3. Secret Handling

禁止展示或记录：

- API key
- Authorization header
- Cookie
- token
- password
- secret
- raw LLM response
- raw prompt
- hidden reasoning
- 未脱敏大 payload

---

## 4. External System Boundary

v1 不承诺：

- 外部 Calendar rollback
- 高风险外部系统写入
- 分布式事务
- 企业级审计合规
- 多用户审批流

---

## 5. LLM Decision Boundary

LLM 可以：

- 生成草案
- 总结上下文
- 解释冲突
- 提出候选方案
- 比较方案
- 生成修改建议

LLM 不可以：

- 未确认直接写入
- 未确认移动日程
- 未确认删除日程
- 未确认发布内容
- 作为唯一冲突检测来源
- 绕过 Policy Guard
- 绕过 Pending Confirmation

---

## 6. Derived Side Effects

Some writes produce derived side effects that are NOT directly agent-executed:

### Plan.progress Auto-sync (Checklist afterChange hook)

When a Checklist with `planId` is updated, the hook recalculates Plan.progress
from ALL planId-linked checklists. This is a deterministic payload hook, not
an Agent action. No confirmation needed — it is a derived computation from
confirmed checklist updates.

### TimelineEvent from Checklist Completion

When a checklist item is marked completed, the Checklist afterChange hook
creates/updates a TimelineEvent. Deterministic, not Agent-driven.

### Plan.linkedContent Cleanup on Rollback

When `create_schedule_items` is rolled back (delete_created_documents),
the rollback executor removes the corresponding schedule-items links from
Plan.linkedContent before deleting the items. This is a consistency guarantee
within the rollback strategy, not a separate agent action.

---

## 7. System Boundary

SunnyPanel 支持本地 Payload 写入的 receipt 与 rollback，但不是完整企业合规审计系统。

v1 不承诺：

- 外部 Calendar rollback
- 高风险外部系统写入
- 分布式事务
- 企业级审计合规
- 多用户审批流
- 多租户 RBAC
