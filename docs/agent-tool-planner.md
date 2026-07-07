# Agent Tool Planner

## LLM Tool Planner 的定位

`planToolsWithLLM()` 是 SunnyPanel 的 LLM Tool Planner Prototype（Phase LLM-R3）。

它让 LLM 根据用户目标生成结构化工具计划，但**只生成计划，不执行工具**。

## Tool Planner 只生成计划，不执行工具

- LLM 输出 `LLMToolPlan`（goal + steps）
- `validateLLMToolPlan()` 校验 plan
- **不进入 Policy Guard、Confirmation、Execute、Receipt、Rollback**
- **不创建 pendingAction**
- **不写数据库**

## Tool Plan Schema

```typescript
type LLMToolPlan = {
  goal: string;              // 高层目标
  intent: string;            // 分类意图
  confidence: number;        // 置信度 0-1
  steps: LLMToolPlanStep[];  // 有序步骤
  missingInformation?: string[];  // 缺失信息
  userFacingSummary?: string;     // 用户可读摘要
};

type LLMToolPlanStep = {
  id: string;                // 步骤 ID
  toolName: string;          // 注册工具名
  mode: "read" | "draft" | "dry_run";  // 执行模式（无 execute）
  reason: string;            // 步骤原因
  input: unknown;            // 工具参数
  dependsOn?: string[];      // 依赖的步骤 ID
  riskLevel: "low" | "medium" | "high";
};
```

## Tool Plan Validation Rules

所有 rules 在 `validateLLMToolPlan()` 中实现（纯函数，无副作用）：

- mode 只允许 `read` / `draft` / `dry_run` — **禁止 execute**
- toolName 必须存在于 Tool Registry
- write tool 只能 `dry_run`（不准 read / draft / execute）
- read tool 只能 `read`
- draft tool 只能 `draft` / `dry_run`
- confidence ∈ [0, 1]，低于 minConfidence → reject
- missingInformation 非空 + 有 dry_run step → reject
- dependsOn 引用必须存在，无循环依赖
- plan 中不得出现 secrets / raw prompt / raw response

## 为什么 LLM 不允许输出 execute

`execute` 是真实数据写入。SunnyPanel 的安全链要求：

> Policy Guard → Pending Confirmation → Execute → Receipt → Rollback

LLM 只能生成 plan。执行链路必须由系统控制。跳过确认直接 execute 会绕过整个安全链。

## Write Tool 为什么只能 dry_run

Write tool（如 `create_plan`、`create_schedule_items`）会写入数据库。LLM 生成的 plan 中只能以 `dry_run` 模式使用写入类工具（生成预览但不实际落库）。真正的 execute 必须经过用户确认。

## AGENT_LLM_TOOL_PLANNER 的行为

```env
AGENT_LLM_TOOL_PLANNER=0  # default → planner not active
AGENT_LLM_TOOL_PLANNER=1  # enabled (prototype only)
```

与 `AGENT_REQUIRE_LLM` 的关系：
- `AGENT_REQUIRE_LLM=1` + LLM 不可用 → planner 返回 `status: "failed"`（unavailable）
- 不 fallback 到 heuristic

## 当前阶段为什么不接入生产主链路

## R4A: LangGraph Shadow Planning Mode (Trace-Only)

Phase LLM-R4A 将 Tool Planner 以 shadow/trace-only 模式接入 pipeline。

- `AGENT_LLM_TOOL_PLANNER_TRACE_ONLY=1` 启用
- 在 context build 后，intent resolution 前异步运行
- 作为 fire-and-forget promise → 不影响主流程
- 失败被捕获 → 不传播到 pipeline
- 只记录 `tool_planning` phase trace events

Shadow planner 使用与 R3 完全相同的 `planToolsWithLLM()` + `validateLLMToolPlan()`。Validator 仍然拒绝 execute / 越权 / 未知 tool / 低 confidence / 循环依赖。

LLM-R3 是 prototype。当前 Tool Planner 可以：
- 生成 tool plan
- 严格验证 tool plan
- 通过所有 contract tests
- **R4A**: 在 pipeline 中以 trace-only shadow mode 运行

但还没有：
- Pipeline 集成（不影响 routing/readiness/draft/execute）
- Schedule / Planning 主链路切换
- 真实 LLM endpoint 集成测试

## R4B: LangGraph Tool Planner Runtime (Read/Draft Only)

Phase LLM-R4B 将 R4A shadow runner 升级为真正的 LangGraph StateGraph。

- 使用 `@langchain/langgraph` 的 `StateGraph` 承载完整状态流
- 7 个节点：checkLLM → prepareCatalog → planTools → validatePlan → routeSteps → runDryRunPreviews → finalizeTrace
- Read/draft tools 通过 `dryRun()` 生成安全预览（不写库）
- Write/dry_run steps 被 blocked，只记录 trace
- Feature flag: `AGENT_LLM_TOOL_PLANNER_GRAPH_RUNTIME=1`
- 优先级: R4B graph runtime > R4A shadow runner

## R4C: Write Tool Dry-run Proposal Preview

Phase LLM-R4C 解除了 R4B 对所有 write/dry_run steps 的 block。

- Eligible write tools（allowlist: `create_plan`, `create_checklist`, `create_schedule_items`）可进入 dryRun → Policy Guard preview
- 仅 preview，不创建真实 PendingAction
- Feature flag: `AGENT_LLM_TOOL_PLANNER_WRITE_PROPOSALS=1`

## R4D: Real Policy Guard & PendingAction Integration

Phase LLM-R4D 将 preview-only 升级为真实 Policy Guard + PendingAction。

- Write proposals 经过 `applyPolicyGuard()` + `evaluatePolicyGuard()` 真实策略评估
- 通过后创建真实 `PendingAction { type: "await_confirmation", action: ProposedAgentAction }`
- Pipeline 改为 await-and-decide（不再是 fire-and-forget）
- Feature flag: `AGENT_LLM_TOOL_PLANNER_REAL_PENDING_ACTION=1`

## R4E: Confirmation-to-Execute Compatibility Verification

Phase LLM-R4E 验证 R4D PendingAction 与现有 confirmation → execute → receipt 链路的兼容性。

- `confirmationMatchesPending()` 按 `action.id` 匹配
- `restoreConfirmedIntent()` 将 `ProposedAgentAction` 转为 `AgentIntent`
- 3 个 allowlist tools 的 round-trip 验证通过

## R4F: Real Postgres DB Smoke

Phase LLM-R4F 在真实 PostgreSQL 环境下验证 Tool Planner → confirm → execute → DB write → receipt 链路。

- 7/7 DB smoke tests pass（有真实 Postgres 时）
- 无 DB 环境 skip，不伪造通过

## R5-A: Disable Legacy Heuristic Business Fallback

Phase R5-A 在 `AGENT_REQUIRE_LLM=1` 下禁用旧 heuristic business paths。

- Tool Planner 不可用/失败时 → 返回 controlled `tool_planner_unavailable` 响应
- 不再 fallback 到: heuristic router, schedule intent boundary, regex slot extraction, deterministic draft generation
- Existing pendingAction confirmation/cancel 仍保持 deterministic
- `AGENT_REQUIRE_LLM=0` 下旧行为不变

## R5-B: Read / Draft Path Parity

Phase R5-B 补齐了 `AGENT_REQUIRE_LLM=1` 下的 read/draft 请求处理。

- Graph runtime 成功完成 read/draft preview 后生成 `assistantMessage`
- Pipeline gate 扩展：read/draft completion → 受控响应（非 `tool_planner_unavailable`）
- `query_plan_progress` metadata fix: `supportsDryRun: false→true`, `supportsExecute: false→true`

## R5-C: Schedule Read Tool & Capability Answer

Phase R5-C 新增了两个低风险 read-only / response-only 能力。

### query_schedule read-only tool

| 属性 | 值 |
|------|-----|
| capability | `read` |
| supportsDryRun | `true` |
| supportsExecute | `false` |
| requiresConfirmation | `false` |
| dryRun 返回 | `AgentDryRunClarifyResult` (type: "clarify") |

- 仅 dryRun preview，不创建 pendingAction
- 不进入 Policy Guard，不调用 execute
- 不写数据库
- 被加入 `AgentWriteIntentName` union 仅为类型系统兼容，语义由 `capability: "read"` 决定

### Capability answer

- `buildCapabilityAnswerResponse()` — 受控静态能力说明
- 不是 regex capability router fallback
- 不展示 raw tool registry JSON

## Current Write Allowlist

```
create_plan
create_checklist
create_schedule_items
```

Write path: dryRun → real Policy Guard → real PendingAction → user confirmation → execute pipeline → receipt

LLM must NOT output `execute` mode.

## Read / Draft Path (summary)

- Read/draft tools only run `dryRun` preview in Tool Planner runtime
- Do NOT call execute
- Do NOT create pendingAction
- Do NOT enter Policy Guard
- Do NOT write DB
- Do NOT create receipt

## Heuristic Boundary

- Legacy heuristic files still exist (not deleted)
- `AGENT_REQUIRE_LLM=0`: old hybrid behavior preserved
- `AGENT_REQUIRE_LLM=1`: no heuristic business fallback for new user goals
- Pending confirmation confirm/cancel detection remains deterministic

## Naming Note

`query_schedule` (and `query_plan_progress`) are included in the shared `AgentWriteIntentName` union only for compatibility with the existing intent/executor type system. Their **capability metadata** (`capability: "read"`) is the authoritative source of their semantics. They must never create pendingAction, enter Policy Guard, call execute, or write to DB.

Future cleanup: split `AgentWriteIntentName` into `AgentReadIntentName | AgentDraftIntentName | AgentWriteIntentName`.

## 后续路线建议

| Phase | 目标 | 状态 |
|-------|------|------|
| R5-D | Documentation & Naming Audit | ✅ 已完成 |
| R6-A | Legacy Heuristic Reachability Audit | ✅ 当前 |
| R5-E | Checklist Draft Tool | 建议 |
| R6-C1 | **Legacy Heuristic Removal (COMPLETE)** | ✅ 已完成 |
| R6-C2-A | Schedule/Planning Deterministic Boundary Audit | ✅ 已完成 |
| R6-C2-B | LOW-risk Schedule/Planning Legacy Test Retirement | ✅ 已完成 |
| R6-C2-C | **Tool Planner Schedule/Planning Proposal Contract Tests** | ✅ 已完成 |
| R6-C2-D | **Gate keyword/regex write-intent rules in intent-boundary.ts (COMPLETE)** | ✅ 已完成 |
| R6-C2-Docs | **Document Schedule/Planning Tool Planner Boundary (COMPLETE)** | ✅ 已完成 |

R6-C2 schedule/planning boundary 文档：`docs/phase-r6-c2-schedule-planning-tool-planner-boundary.md`

### 当前架构

```
User request → LLM Tool Planner proposal → schema validation
→ readiness / slot validation → draft / dry-run → Policy Guard
→ Pending Confirmation → user confirm → Execute → Receipt → rollback
```

核心分工：

- Tools define what the system can do.
- LLM decides what should be proposed.
- Workflow controls what can happen.
- Guards decide what is allowed.
- User decides what is executed.

## R6-C2-C Proposal Contract Coverage

Phase R6-C2-C added 64 new contract tests (32 schedule + 32 planning) using deterministic
tool registry metadata, dryRun outputs, readiness evaluation, and controlled response builders.

| Contract | Schedule | Planning |
|----------|----------|----------|
| Write tool metadata (capability, requiresConfirmation, supports*) | ✅ | ✅ |
| Draft tool dryRun → proposed_action with requiresConfirmation | ✅ | ✅ |
| DryRun snapshot: no DB write, no receipt, no execute markers | ✅ | ✅ |
| Missing slots/fields → readiness=insufficient, no write | ✅ | ✅ |
| Complete slots → draftable or confirmable | ✅ | ✅ |
| Read-only tool dryRun → clarify (not proposed_action) | ✅ | — |
| compose_checklist: draft-only, no execute | — | ✅ |
| Planner unavailable: no pendingAction, no execute, no DB write | ✅ | ✅ |
| Invalid tool → null rejection | ✅ | ✅ |
| Write allowlist boundary (3 tools) | ✅ | ✅ |
| No heuristic fallback in controlled responses | ✅ | ✅ |
| Deterministic readiness (no network, idempotent) | — | ✅ |

Key principle verified across all new tests:

> LLM proposes. Workflow validates. Guard authorizes. User confirms. Executor writes. Receipt records. Rollback is available when applicable.

## R6-C1 Replacement Coverage

| 旧 heuristic path | 新 Tool Planner / controlled path |
|-------------------|----------------------------------|
| query heuristic | `query_schedule` read-only tool |
| capability heuristic | `buildCapabilityAnswerResponse()` |
| knowledge heuristic | LLM response composer / `retired-intent-response.ts` |
| business intent heuristic | Tool Planner proposal + schema/safety validation |
| confirmation safety signals | `intent-safety-signals.ts` (migrated, preserved) |

## R6-C1 完成状态

- `intent/heuristics/*` (13 files) 已物理删除
- `src/lib/agent` 0 active heuristic imports
- Tool Planner read/draft/write proposal path 完整
- confirmation / safety / receipt / rollback 保留
- Non-Postgres test baseline: 0 fail
