# Agent LLM Required Architecture

## 为什么引入 AGENT_REQUIRE_LLM

SunnyPanel 的 Agent 最初设计为 LLM + 启发式 hybrid 架构。当 LLM 不可用时，Agent 仍能通过大量 keyword、regex、deterministic template 路径完成 business intent routing、slot extraction、draft generation 和 clarification response。

这带来了两个问题：

1. **安全边界被启发式包围**：80+ keyword lists、60+ regex patterns 分布在 intent/heuristics、schedule/intent-boundary、schedule/readiness、planning/readiness-gate 等模块中，这些 heuristic 同时承担了「业务决策」和「安全边界」的双重角色
2. **两条代码路径的语义鸿沟**：LLM path 和 heuristic path 对同一输入可能产生不同的 intent、slots 和 response，增加了不可预测性

`AGENT_REQUIRE_LLM` 是向目标架构转型的第一步：

> Tools define what the system can do.
> LLM decides what should be proposed.
> Workflow controls what can happen.
> Guards decide what is allowed.
> User decides what is executed.

## 什么是 LLM-Required Mode

当 `AGENT_REQUIRE_LLM=1` 时：

- **有 LLM**：Agent 正常进入 pipeline（router → readiness → draft → dry-run → policy guard → confirmation → execute → receipt）
- **无 LLM**：Agent 直接返回 `llm_unavailable`，不进入任何 business workflow

这不是「取消安全边界」—— Policy Guard、Confirmation、Receipt、Rollback 等 safety invariants 完全保留。这是取消「无 LLM 时靠启发式完成业务逻辑」。

## 行为矩阵

| AGENT_REQUIRE_LLM | AGENT_DISABLE_LLM | LLM Config | 行为 |
|---|---|---|---|
| 0 (default) | 0 | present | 现有行为，LLM 为主，heuristic fallback |
| 0 (default) | 1 | any | 现有行为，heuristic 完成业务逻辑 |
| 1 | 0 | present | **LLM-required，正常 pipeline** |
| 1 | 0 | missing | **Agent unavailable** |
| 1 | 1 | any | **Agent unavailable** |

## 无 LLM 时不再 fallback 到启发式业务逻辑

当 `AGENT_REQUIRE_LLM=1` 且 LLM 不可用时，以下路径全部被拦截：

- ❌ heuristic intent routing（`intent/heuristics/*`）
- ❌ heuristic schedule intent boundary（`schedule/intent-boundary.ts`）
- ❌ heuristic slot extraction（`schedule/readiness.ts` regex extractors）
- ❌ heuristic draft generation（`planning/draft.ts`, `schedule/draft.ts`）
- ❌ heuristic clarification fallback（`response/clarification/fallback-composer.ts`）
- ❌ rule-based workflow continuation（`session/rule-pre-check.ts` business rules）
- ❌ deterministic business draft

拦截位置在 Agent chat pipeline 的最早入口（`run-agent-chat-pipeline.ts`），在 context build 之前。

## 保留的 Deterministic Safety Guards

以下安全机制不受影响，始终保持 deterministic：

- ✅ Schema validation
- ✅ Policy Guard（`policy/guard.ts`）
- ✅ Pending Confirmation（`confirmation-step.ts`）
- ✅ Confirmation / cancel safety detection
- ✅ Dry-run（`dry-run-and-propose-step.ts`）
- ✅ Execute（`executor.ts`）
- ✅ Receipt（`AgentActionReceipts` 幂等保护）
- ✅ Rollback
- ✅ Capability gate
- ✅ Thread event persistence（`AgentThreadEvents`）
- ✅ LangGraph checkpoint
- ✅ UI static error rendering
- ✅ Developer trace

## Pipeline 拦截实现

在 `run-agent-chat-pipeline.ts` 的返回函数最早阶段：

```typescript
const llmAvailability = await checkAgentLLMAvailability();
if (!llmAvailability.available) {
  // 记录 trace event
  // emit user-visible error message
  // return unavailable response (no pendingAction, no draft, no receipt)
}
```

`checkAgentLLMAvailability()` 检查：
1. `AGENT_REQUIRE_LLM=1`？（不满足则返回 available）
2. `AGENT_DISABLE_LLM=1`？（满足则返回 unavailable）
3. `getAgentModelConfig()` 是否返回有效配置？（不满足则返回 unavailable）

注意：此检查**不调用远程 LLM**，只验证配置可用性。

## Unavailable Response 结构

```typescript
{
  assistantMessage: "当前 Agent 需要 LLM 才能处理这个请求。请检查模型配置后重试。",
  intent: "clarify",           // 非 write intent
  pendingAction: null,         // 无待确认动作
  planningDraft: undefined,    // 无草案
  schedulingDraft: undefined,  // 无草案
  tokenUsage: { totalTokens: 0, ... },  // 零 token 消耗
  backendTraceEvents: [{
    phase: "llm_availability",
    status: "failed",
    summary: "LLM required but unavailable",
    outputPreview: { reason: "llm_disabled" | "llm_missing_config" | ... }
  }]
}
```

用户可见文案是静态的，不暴露 `AGENT_REQUIRE_LLM`、`AGENT_DISABLE_LLM`、`missing_api_key` 等工程字段。这些只允许在 developer trace 中显示。

## AGENT_REQUIRE_LLM 与 AGENT_DISABLE_LLM 的关系

- `AGENT_REQUIRE_LLM` 控制的是「无 LLM 时是否继续业务」
- `AGENT_DISABLE_LLM` 控制的是「是否调用 LLM API」

两者独立：
- 默认模式：`AGENT_REQUIRE_LLM=0`，`AGENT_DISABLE_LLM=1` → heuristic fallback（现有测试配置）
- 开发模式：`AGENT_REQUIRE_LLM=0`，`AGENT_DISABLE_LLM=0` → LLM + heuristic hybrid（现有开发配置）
- **LLM-required**：`AGENT_REQUIRE_LLM=1`，`AGENT_DISABLE_LLM=0` → LLM required，无 LLM 即 unavailable

当前默认值为 `AGENT_REQUIRE_LLM=0`（不改变现有行为）。后续阶段可能将默认值切换为 `1`。

## 为什么这不是取消安全边界

Agent 的安全模型基于以下原则：

> LLM plans and proposes → System validates and gatekeeps → User confirms → System executes with receipt → Rollback available

`AGENT_REQUIRE_LLM=1` 移除的是「无 LLM 时 heuristic 替代 LLM plans and proposes」这一降级路径。但 System validates and gatekeeps（Policy Guard、Confirmation、Receipt、Rollback）完全保留。

实际上，**移除 heuristic business fallback 增强了安全**：不再有 keyword/regex 误判导致的意外业务决策。

## 后续 Tool Planner 改造路线

| Phase | 目标 | 状态 |
|-------|------|------|
| LLM-R0 | LLM-Required Architecture Audit | ✅ 已完成 |
| LLM-R1 | LLM Required Mode Foundation | ✅ 已完成 |
| LLM-R2 | Tool Registry Normalization（capability/inputSchema 补齐） | ✅ 已完成 |
| LLM-R3 | LLM Tool Planner + Tool Plan Validator | ✅ 已完成 |
| LLM-R4A | Tool Planner Shadow Trace-only Integration | ✅ 已完成 |
| LLM-R4B | LangGraph Tool Planner Runtime Preview | ✅ 已完成 |
| LLM-R4C | Write Tool Dry-run Proposal Preview | ✅ 已完成 |
| LLM-R4D | Real Policy Guard & PendingAction Integration | ✅ 已完成 |
| LLM-R4E | Confirmation-to-Execute Compatibility Verification | ✅ 已完成 |
| LLM-R4F | Real Postgres DB Smoke | ✅ 已完成 |
| R5-A | Disable Heuristic Business Fallback | ✅ 已完成 |
| R5-B | Read / Draft Path Parity | ✅ 已完成 |
| R5-C | Schedule Read Tool & Capability Answer | ✅ 已完成 |
| **R5-D** | **Documentation & Naming Audit** | ✅ 已完成 |
| **R6-C1** | **Legacy Heuristic Removal** | ✅ 已完成 |
| R6-C2 | Schedule/Planning Deterministic Fallback Audit | 建议 |
| R5-E+ | Checklist Draft, Legacy Cleanup, Production Hardening | 建议 |

### R6-C1 后的主路径

```
User request → LLM Tool Planner proposal → schema validation →
readiness / dry-run → Policy Guard → Pending Confirmation →
user confirm → Execute → Receipt → rollback (when applicable)
```

### R6-C1 移除的

- `intent/heuristics/*` (13 files) — 旧 business heuristic intent parser
- `parseHeuristicIntent` / `collectHeuristicCandidates`
- heuristic correctness tests (重写为 retired / Tool Planner contract)

### R6-C1 保留的

- confirmation safety signals (`intent-safety-signals.ts`)
- readiness / validation / dry-run / Policy Guard / Pending Confirmation
- Receipt / Rollback
- query_schedule read-only tool
- capability answer controlled response

### 禁止路径

```
LLM output → execute
heuristic parser → write intent → execute
query / capability answer → pendingAction / DB write
```

### R5-A/B/C 后的链路

```
AGENT_REQUIRE_LLM=1
→ checkAgentLLMAvailability()  [R1]
→ Tool Planner Graph Runtime   [R4B]
  → read/draft: dryRun preview → assistantMessage → controlled response  [R5-B]
  → write allowlist: dryRun → real Policy Guard → real PendingAction     [R4D]
  → failure/rejection: controlled tool_planner_unavailable response       [R5-A]
→ existing pendingAction confirmation → deterministic confirm/cancel      [preserved]
```

### query_schedule read-only note

`query_schedule` 是 read-only tool（`capability: "read"`, `supportsExecute: false`）。它被加入共享 intent/tool typing 仅为类型系统兼容性。不得创建 pendingAction、进入 Policy Guard、调用 execute 或写入数据库。

### Capability answer

Capability answer (`buildCapabilityAnswerResponse`) 是受控响应路径，不是 regex capability router fallback。不展示 raw tool registry JSON。

## 相关文件

- `src/lib/agent/llm-required/` — 核心模块
- `src/lib/agent/chat-pipeline/run-agent-chat-pipeline.ts` — Pipeline 拦截点
- `src/lib/agent/trace/types.ts` — `AgentTracePhase` 新增 `llm_availability`
- `src/lib/agent/activity/build-activity-steps.ts` — Activity 映射更新
- `tests/agent/llm-required-mode.test.ts` — Feature flag + Response 测试
- `tests/agent/no-llm-unavailable.test.ts` — Pipeline stop + Fallback prevention 测试
