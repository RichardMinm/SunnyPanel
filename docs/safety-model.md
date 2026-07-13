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

---

## Query Runtime Trust Boundary

The guarded Query path trusts only the server-authenticated Payload user passed through the API boundary. It describes that actor as a **trusted single-user admin actor**. Client `isAdmin` or role values, headers, and message text do not enable adoption. Unauthenticated requests are rejected before the agent handler.

This is not a complete role system. The current model has no independent fine-grained RBAC and does not provide multi-user authorization semantics. The runtime and adoption settings must both opt in; any unrecognized value is disabled.

## Provider Data Minimization

Threats and controls:

| Threat | Control |
| --- | --- |
| Workspace prompt injection | Provider receives no workspace or user-request text. |
| Invented resource ID | Provider receives no ID, title, or resource text. |
| Numeric fact hallucination | Canonical facts are deterministic; Provider receives no numeric facts; numeric commentary is omitted. |
| Execution claim | Local commentary validator rejects execution language. |
| Unsafe escalation | Local validator rejects admitted escalation patterns. |
| Provider timeout or error | Query completes with canonical facts only. |
| Client-side admin forgery | Actor status comes from the server authentication result. |
| Accidental runtime enablement | `AGENT_QUERY_RUNTIME=langchain` and `AGENT_QUERY_ADOPTION=admin` must both pass. |
| Duplicate model call | Exact allowlist excludes `answer_question`; adopted dispatch permits at most one Query Provider call. |
| Hidden Legacy fallback | Provider failure omits commentary and does not start Legacy after Provider work. |
| Query-path business mutation | Query modules have no Executor or write capability. |

The Provider sees only the static system protocol and the exact enum-only qualitative projection. It does not see `QueryFacts`, canonical text, user input, workspace context, resource identifiers, names, counts, percentages, dates, memory, secrets, or hidden reasoning. `auditQualitativeProviderInput()` fails closed before a model call if this shape changes.

## Deterministic Facts

Request-time deterministic loaders read current Payload data into shared `QueryFacts`. Deterministic code performs resource matching, counting, due-date handling, and canonical rendering. The Provider neither calculates nor mutates these facts. Each adopted turn loads facts at most once, and the evaluation collector does not retain them.

## Optional Commentary

Commentary is an expression enhancement, not a fact source. The Provider receives enum states only, its entire output is buffered, and local validation occurs before any user-visible emission. Invalid, numeric, tool-call, timed-out, or failed output is omitted. The canonical answer remains complete and is persisted normally.

This control does not promise that a Provider never emits invalid output. It guarantees only that commentary failing the implemented local contract is not appended.

## Admin Adoption Gate

The gate is default-deny and runs before facts or Provider work: runtime, adoption, trusted actor, exact intent, and exact arguments must all pass. Rejected requests keep their existing behavior with zero guarded facts-loader and Provider calls. This is a rollout safety gate, not an enterprise permission framework.

## Failure Degradation

- Gate rejection: existing path, no guarded facts read, no Query Provider call.
- Missing plan resource: deterministic clarification, no Provider call.
- Provider/input audit/timeout/validation failure: canonical-only completion, normal persistence and done, no partial commentary, no second facts read, no post-Provider Legacy run.
- Either kill switch disabled: the next request handled by the process remains on Legacy.

The process-local observation collector stores bounded sanitized counters and latency only. It is non-durable and is not an audit log.

## Explicit Non-goals

- Complete enterprise audit or compliance
- Durable Query observation history
- Multi-user RBAC or fine-grained authorization
- Provider correctness guarantees
- Query access to Executor, tools, Router decisions, or resource selection
- External system rollback
- Distributed transactions
- Query allowlist expansion or Legacy removal
