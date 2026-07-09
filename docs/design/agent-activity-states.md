# Agent Activity States

## 1. User-visible States

Allowed states:

- idle
- understanding
- reading_context
- classifying_intent
- drafting
- dry_running
- policy_checking
- pending_confirmation
- executing
- receipt_recorded
- rollback_available
- failed
- rolled_back

Rules:

- 状态来自结构化 workflow state
- 文案短句
- 不展示 hidden reasoning
- 不展示 raw prompt
- 不展示 raw LLM response
- 不展示 secrets

---

## 2. Developer Trace States

Allowed:

- step name
- step status
- timestamp
- sanitized payload summary
- action type
- target collection
- receipt id
- rollback id
- error summary

Forbidden:

- raw hidden reasoning
- raw prompt
- raw LLM response
- API key
- Authorization header
- Cookie
- token
- password
- secret
- 未脱敏大 payload

---

## 3. State Mapping

```txt
Intent Router        → classifying_intent
Context Read         → reading_context
Draft                → drafting
Dry-run              → dry_running
Policy Guard         → policy_checking
Pending Confirmation → pending_confirmation
Execute              → executing
Receipt              → receipt_recorded
Rollback Ready       → rollback_available
Failure              → failed
Rollback Done        → rolled_back
```

---

## 4. Motion Rules

- 状态变化可有轻量过渡
- 不伪造执行进度
- 不用动画替代真实状态
- 不在动画状态中保存业务 truth
