# R6-C2 Schedule / Planning Tool Planner Boundary

## 1. Summary

R6-C2 明确了 SunnyPanel Agent 在 schedule/planning 领域的 LLM Tool Planner 边界。

R6-C1 删除了旧通用 `intent/heuristics/*` business intent parser。
R6-C2-A/B/C/D 在此基础上：

- **审计**了 schedule/planning 中哪些 deterministic code 是 safety contract、哪些是 legacy fallback。
- **退休**了 LOW-risk legacy-only tests。
- **补强**了 Tool Planner schedule/planning proposal contract tests。
- **Gate**了 `schedule/intent-boundary.ts` 中 keyword/regex write-intent rules。

核心结论：

> 在 `AGENT_REQUIRE_LLM=1` 下，schedule create/revise write intent 不得来自 keyword/regex/rule fallback，必须来自 Tool Planner proposal。Read-only schedule query 仍保留为 controlled read-only path。

## 2. Current Architecture

```
User request
→ LLM Tool Planner proposal
→ schema validation
→ readiness / slot validation
→ draft / dry-run
→ Policy Guard
→ Pending Confirmation
→ user confirm
→ Execute
→ Receipt
→ rollback support when applicable
```

关键原则：

| Agent 角色 | 职责 | 边界 |
|-----------|------|------|
| Tools | 定义系统能做什么 | 注册、capability 元数据 |
| LLM | 负责提出应该做什么 | 只生成 plan，不 execute |
| Workflow | 控制事情能否进入下一步 | readiness → draft → guard |
| Guards | 判断是否允许 | Policy Guard / confirm gate |
| User | 决定是否最终执行 | confirmation |
| Executor | 真实写入 | 用户确认后 |
| Receipt | 记录操作凭证 | 幂等保护 |

具体表述：

> Tools define what the system can do.
> LLM decides what should be proposed.
> Workflow controls what can happen.
> Guards decide what is allowed.
> User decides what is executed.

## 3. AGENT_REQUIRE_LLM=1 Boundary

当 `AGENT_REQUIRE_LLM=1` 时：

- keyword / regex write-intent rules are disabled
- schedule create / revise write intent must come from Tool Planner proposal
- read-only query signals may still route to `query_schedule`
- LLM classifier path remains available where explicitly wired
- no heuristic business fallback is allowed

当 `AGENT_REQUIRE_LLM=0`（默认）时：

- keyword / regex write-intent rules remain active
- EOD loop uses readiness gates + deterministic draft builders
- Old hybrid behavior preserved for backward compatibility

### R6-C2-D Gate Detail

`src/lib/agent/schedule/intent-boundary.ts` 中：

- **Gated**: `hasExplicitCreateSignal` → `schedule_creation` (keyword write intent)
- **Gated**: `hasDraftRevisionSignal` → `revise_schedule_draft` (keyword revise intent)
- **Kept**: `hasQuerySignal` → `query_schedule` (read-only safety guard)
- **Kept**: LLM classifier path (normalize + LLM result → boundary result)

Gate 实现：

```typescript
// R6-C2-D: Keyword/regex write-intent rules are gated behind AGENT_REQUIRE_LLM=0.
if (!isAgentRequireLLMEnabled()) {
  // keyword write-intent rules (only in legacy mode)
}
```

## 4. Read-only Query Boundary

`query_schedule` 是 read-only tool / controlled answer path。

| 属性 | 值 |
|------|---|
| capability | `read` |
| requiresConfirmation | `false` |
| canRunWithoutConfirmation | `true` |
| supportsExecute | `false` |
| supportsDryRun | `true` |
| supportsRollback | `false` |
| riskLevel | `low` |

Safety invariants：

- 不创建 pendingAction
- 不 execute
- 不写 DB
- 不创建 receipt
- 不进入 Policy Guard

`query_schedule` 可以在 `AGENT_REQUIRE_LLM=1` 下继续存在，因为它不是 write fallback — 它是 read-only controlled path。

注意：`query_schedule` 在 `AgentWriteIntentName` union 中是类型系统兼容性需要，其 `capability: "read"` 元数据是权威语义来源。

## 5. Write Proposal Boundary

Schedule / planning write proposal 可能由 Tool Planner 提出，但必须经过完整安全链：

```
Tool Planner proposal
→ schema validation
→ readiness / required-field validation
→ draft / dry-run
→ Policy Guard
→ Pending Confirmation
→ user confirmation
→ Execute
→ Receipt
```

Write allowlist（R4C）：

```
create_schedule_items
create_plan
create_checklist
```

**禁止路径**（在 `AGENT_REQUIRE_LLM=1` 下）：

- Tool Planner output → execute（不得跳过 confirmation）
- keyword / regex → write intent → execute（keyword write rules 已 gate）
- query → pendingAction（read-only 不得进入 write workflow）
- capability answer → pendingAction（capability answer 是 controlled response）
- LLM → DB write（LLM 不直接写库）
- LLM → receipt（receipt 由 Executor 创建）

## 6. What Was Gated / Retired

### R6-C2-B: LOW-risk Legacy Tests Retired

| 文件 | 原因 | Replacement |
|------|------|-------------|
| ~~`tests/agent/schedule/schedule-intent-boundary.test.ts`~~ | 纯 keyword/regex 边界测试 | Tool Planner proposal contract tests |
| ~~`tests/agent/schedule/schedule-query-intent.test.ts`~~ | R6-C1 stub 杀死所有断言（3/3 fail） | `query_schedule` read tool tests |

### R6-C2-D: Keyword Write-Intent Rules Gated

| Module | Change | Detail |
|--------|--------|--------|
| `schedule/intent-boundary.ts` | Gated | `hasExplicitCreateSignal` + `hasDraftRevisionSignal` keyword rules disabled when `AGENT_REQUIRE_LLM=1` |
| `schedule/intent-boundary.ts` | Kept | `hasQuerySignal` → `query_schedule` read-only safety guard |
| `schedule/intent-boundary.ts` | Kept | LLM classifier path |

## 7. What Was Kept

### Safety / Contract Modules

| Module | Purpose |
|--------|---------|
| `schedule/readiness.ts` | Schedule slot validation — insufficient / draftable / confirmable |
| `schedule/readiness-gate.ts` | Schedule readiness orchestration |
| `planning/readiness.ts` | Plan field validation — goal, deadline, scope, progress, etc. |
| `planning/readiness-gate.ts` | Plan readiness orchestration |
| `slot-extraction/` | LLM slot extraction (not heuristic) |
| `conflict-awareness.ts` | Schedule conflict detection |
| `conflict-suggestions.ts` | Conflict resolution suggestions |
| `free-slots.ts` | Free time slot computation |

这些模块承担 readiness、required field validation、date/time validation、conflict detection、free slot calculation 等安全/产品契约。它们不是旧 business heuristic intent parser。

### Draft / Product Behavior Modules

| Module | Purpose |
|--------|---------|
| `schedule/draft.ts` | Schedule draft construction |
| `schedule/draft-message.ts` | Draft display formatting |
| `schedule/revise-draft*.ts` | Schedule draft revision |
| `planning/draft.ts` | Plan draft construction |
| `planning/draft-message.ts` | Draft display formatting |
| `planning/revise-plan-draft.ts` | Plan draft revision |
| `planning/checklist-draft.ts` | Checklist draft generation |
| `planning/checklist-draft-flow.ts` | Checklist draft flow |
| `planning/created-plan-lifecycle.ts` | Plan lifecycle tracking |
| `planning/plan-checklist-progress.ts` | Read-only progress computation |
| `schedule/query-summary.ts` | Schedule query formatting |
| `schedule/prepare-schedule-creation.ts` | Draft → create args |
| `planning/prepare-plan-creation.ts` | Draft → create args |
| `planning/prepare-checklist-creation.ts` | Checklist draft → create args |

这些模块可能承担草案修改、计划草案、清单草案、计划生命周期和进度计算等产品行为。即使某些当前 production caller 为 0，也不在 R6-C2 中直接删除。

### Protected Tests

| Group | Files |
|-------|-------|
| Schedule E2E | `schedule/schedule-workflow-e2e.test.ts`, `schedule/schedule-workflow-product-e2e.test.tsx` |
| Planning E2E | `planning/planning-full-workflow-e2e.test.ts` |
| Write path | `create-schedule-items-*.test.ts`, `create-checklist-*.test.ts`, `timeline-event-*.test.ts` |
| Read-only | `schedule-query-flow.test.ts` |
| Safety | `policy-guard`, `action-receipts`, `rollback*`, `tool-dry-run`, `execute-and-persist-step` |
| Tool Planner | `tool-planner-schedule-*`, `tool-planner-planning-*`, `llm-required-*`, `root-router-contract`, `langgraph-full-runtime`, `confirmation` |

## 8. Replacement Coverage

### R6-C2-C Proposal Contract Tests

| File | Tests | Coverage |
|------|-------|----------|
| `tests/agent/tool-planner-schedule-proposal-contract.test.ts` | 32 | Write tool metadata, dryRun→proposed_action, no DB write, no execute, missing slots→insufficient, planner unavailable→controlled, invalid tool→null, write allowlist |
| `tests/agent/tool-planner-planning-proposal-contract.test.ts` | 32 | Write tool metadata, dryRun→proposed_action, no DB write, no execute, missing fields→insufficient, compose_checklist draft-only, mergePlanSlots safety, planner unavailable→controlled |

### Existing Tool Planner Replacement Coverage

| File | Coverage |
|------|----------|
| `tests/agent/tool-planner-schedule-read-tool.test.ts` | query_schedule read-only metadata, catalog, dryRun, no execute |
| `tests/agent/tool-planner-no-heuristic-query-fallback.test.ts` | Gated imports, deleted modules NOT importable, query_schedule read-only contract |
| `tests/agent/llm-required-no-heuristic-business-path.test.ts` | Feature flag gating, heuristic existence, R6-C2-D gate tests |
| `tests/agent/tool-planner-capability-answer-path.test.ts` | Capability answer controlled response |
| `tests/agent/tool-planner-read-draft-parity.test.ts` | Read/draft tool metadata, unavailable responses |

### Contract Verification Summary

| Contract | Schedule | Planning |
|----------|:--------:|:--------:|
| Write tool metadata (capability, requiresConfirmation, supports*) | ✅ | ✅ |
| Draft tool dryRun → proposed_action | ✅ | ✅ |
| DryRun: no DB write, no receipt, no execute | ✅ | ✅ |
| Missing slots → readiness=insufficient | ✅ | ✅ |
| Complete → draftable or confirmable | ✅ | ✅ |
| Read-only → clarify (not proposed_action) | ✅ | — |
| compose_checklist: draft-only, no execute | — | ✅ |
| Planner unavailable: no pendingAction, no execute | ✅ | ✅ |
| Invalid tool → null | ✅ | ✅ |
| Write allowlist boundary (3 tools) | ✅ | ✅ |
| No heuristic fallback in controlled responses | ✅ | ✅ |
| AGENT_REQUIRE_LLM=1 gates keyword write rules | ✅ | — |

## 9. Deferred List

以下模块在 R6-C2 中**暂不处理**。它们可能承担 safety / readiness / draft / revise / conflict 等产品行为，不能在 audit 阶段后直接删除。

| Module | Defer Reason | Risk if Deleted Now | Required Before Action |
|--------|------------|--------------------|----------------------|
| `schedule/readiness.ts` | Slot validation — safety contract | Write proposals without slot validation | Independent reachability audit |
| `schedule/readiness-gate.ts` | Readiness orchestration — product behavior | EOD loop gate removed | Targeted replacement tests |
| `planning/readiness.ts` | Field validation — safety contract | Write proposals without field validation | Independent reachability audit |
| `planning/readiness-gate.ts` | Readiness orchestration — product behavior | EOD loop gate removed | Targeted replacement tests |
| `slot-extraction/` | LLM slot extraction — NOT heuristic | LLM slot extraction lost | Prove replacement |
| `conflict-awareness.ts` | Conflict detection — safety contract | Schedule conflicts uncaught | Independent audit |
| `conflict-suggestions.ts` | Conflict resolution — safety contract | No conflict suggestions | Independent audit |
| `free-slots.ts` | Free time calculation — safety contract | Slot computation lost | Independent audit |
| `schedule/revise-draft*.ts` | Draft revision — 0 production callers currently | May be wired via dynamic path | Reachability audit first |
| `planning/revise-plan-draft.ts` | Plan revision — may be product behavior | May break draft revision UX | Reachability audit first |
| `planning/checklist-draft-flow.ts` | Checklist draft flow — 0 production callers | May be wired via dynamic path | Reachability audit first |
| `created-plan-lifecycle.ts` | Plan lifecycle — product behavior | Plan lifecycle tracking lost | Independent audit |
| `plan-checklist-progress.ts` | Progress computation — read-only | Progress display broken | Independent audit |

## 10. Safety Boundaries and Non-goals

### Current Scope

- SunnyPanel 当前是单用户/管理员模型
- 主要写入本地 Payload / PostgreSQL
- 支持本地 receipt / rollback / Agent Ops
- Agent Activity 展示结构化执行状态，不展示 hidden chain-of-thought

### Non-goals

以下不在当前承诺范围内：

- 多用户细粒度权限（RBAC）
- 外部 Calendar rollback
- 分布式事务
- 完整企业审计合规系统
- 自动重排 schedule
- 高风险外部系统写入

### Agent Activity / Trace

- Agent Activity 展示的是结构化执行状态，不是模型真实 Chain-of-Thought
- Backend Trace 是 developer-visible sanitized trace
- 不展示 raw prompt / raw response / token / secret / API key

## 11. Next Steps

R6-C2 整体收口后，建议：

- **M7-Docs**: Demo / Showcase / Interview Materials
- 当前 Agent Workflow v1、LLM Tool Planner baseline、safety workflow、R6 cleanup 已具备展示价值
- 不建议继续无限清理 schedule / planning

如果仍要继续 R6：

- **R6-C2-E**: Remove Deferred Dead Tests Only（最小 follow-up）
- 不要删除 readiness / draft / revise / conflict modules

### R6-C2 Phase Summary

| Phase | Status | Deliverable |
|-------|--------|-------------|
| R6-C2-A | ✅ | Schedule/planning deterministic boundary audit |
| R6-C2-B | ✅ | LOW-risk legacy test retirement (2 files) |
| R6-C2-C | ✅ | Tool Planner proposal contract tests (64 tests) |
| R6-C2-C-Fix | ✅ | Restored no-heuristic fallback replacement coverage |
| R6-C2-D | ✅ | Gated keyword/regex write-intent rules |
| R6-C2-Docs | ✅ | Boundary documentation (this document) |
