# Agent Tool Registry

## Tool Registry 的作用

`agentToolRegistry` 是 SunnyPanel Agent 所有写入/草案/查询工具的单一真相源（Single Source of Truth）。每个 tool 封装了：

1. **dryRun**：生成写入预览（no side effects），展示拟执行动作、影响范围和风险
2. **execute**：执行真实写入（有副作用），需要先通过 Policy Guard 和 confirmation
3. **rollback**：回滚策略元数据，用于已经执行的写入操作的撤销

## Tool 与 Workflow 的关系

```
User message
  → Intent Router
  → Readiness / Draft
  → [Tool selection via router]
  → Tool.dryRun → ProposedAction
  → Policy Guard
  → Pending Confirmation
  → Tool.execute → AgentToolResult
  → Receipt (AgentActionReceipts 幂等保护)
  → Rollback (if available)
```

Tool 是执行层，不是决策层。LLM（未来的 Tool Planner）负责选择 tool，但执行链路（Policy Guard → Confirmation → Execute → Receipt → Rollback）是确定性的。

## Tool Metadata 字段说明

### 执行层字段（Phase pre-R2，已有）

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | `AgentWriteIntentName` | Tool 唯一名称 |
| `intent` | `AgentWriteIntentName` | 对应的 Agent intent |
| `description` | `string` | 人类可读的描述 |
| `dryRun` | `(args, context) => Promise<AgentToolDryRunResult>` | 生成写入预览 |
| `execute` | `(args, context, onTrace?) => Promise<AgentToolResult>` | 执行真实写入 |
| `requiresConfirmation` | `boolean` | 是否需要用户确认 |
| `riskLevel` | `"high" \| "low" \| "medium"` | 风险等级 |
| `rollback?` | `{ description, status: "planned" }` | 回滚策略元数据 |

### LLM Planner 字段（Phase LLM-R2，新增）

| 字段 | 类型 | 说明 |
|------|------|------|
| `capability` | `AgentToolCapability` | 操作分类：read / draft / write / rollback |
| `inputSchema` | `AgentToolInputSchema` | 输入参数 schema 描述 |
| `outputSchema?` | `unknown` | 输出 schema（预留） |
| `canRunWithoutConfirmation` | `boolean` | 是否可以不需要用户确认（read/draft 工具） |
| `supportsDryRun` | `boolean` | 是否支持 dry-run 预览 |
| `supportsExecute` | `boolean` | 是否支持真实执行 |
| `supportsRollback` | `boolean` | 是否支持回滚（与 `rollback` 字段一致） |

## Capability 分类

| Capability | 含义 | 副作用 | 是否需要确认 | 示例 |
|-----------|------|--------|-------------|------|
| `read` | 只读查询 | 无 | 否 | `query_plan_progress`, `query_schedule` |
| `draft` | 生成草案 | 无（dry-run 阶段） | 否 | `compose_plan`, `compose_schedule_item`, `compose_timeline_event` |
| `write` | 真实写入 | 有 | 是 | `create_plan`, `create_schedule_items`, 等 13 个 |
| `rollback` | 回滚操作 | 有 | 是 | 当前无独立 rollback tool（rollback 嵌入在 write tools 中） |

## Risk Level 分类

| Risk Level | 说明 | 典型工具 |
|-----------|------|---------|
| `high` | 批量写入、删除、不可恢复操作 | `delete_record`, `complete_plan_item`, `add_completion_note`, `compose_timeline_event` |
| `medium` | 单条写入、修改 | `create_plan`, `create_checklist`, `create_schedule_items`, `schedule_plan`, `append_plan_item`, `modify_record`, `reschedule_item`, `save_memory`, `weekly_review`, `compose_plan`, `compose_schedule_item` |
| `low` | 只读、可逆操作 | `query_plan_progress`, `query_schedule`, `cancel_schedule_item` |

> **Audit note (R2-Fix):** `create_schedule_items` 和 `schedule_plan` 的业务语义应属于 high risk（批量写入），`compose_timeline_event` 的业务语义应属于 medium risk（draft tool）。但 R2 阶段不改 riskLevel，因为：
> 1. `riskLevel` 在 `actionBase()` 中影响 `requiresConfirmation`（`riskLevel !== "low"`）
> 2. `riskLevel` 在 `safety.test.ts`、`permission-resolver.ts`、`orchestration/execution-graph.ts` 等多处被消费
> 3. 风险等级重分类需要先解耦 `riskLevel` 与行为语义，应在后续专门 Phase 中进行

## requiresConfirmation vs canRunWithoutConfirmation

- `requiresConfirmation`：工具定义级别的声明——是否为写操作
- `canRunWithoutConfirmation`：LLM Planner 消费级——是否可以不经确认直接执行

两者关系：
- Write tool：`requiresConfirmation=true`，`canRunWithoutConfirmation=false`
- Draft tool：`requiresConfirmation=true`（走 dry-run 确认流程），`canRunWithoutConfirmation=true`（草案本身不写库）
- Read tool：`requiresConfirmation=false`，`canRunWithoutConfirmation=true`

## supportsDryRun / supportsExecute / supportsRollback

三者描述的是 tool 的能力边界：

- `supportsDryRun`：是否能生成写入预览
- `supportsExecute`：是否能执行真实写入
- `supportsRollback`：是否能回滚已执行操作（与 `rollback` 字段存在性一致）

注意：这三个是声明性元数据，不改变实际行为。一个 write tool 即使 `supportsRollback=true`，也需要 execute 阶段成功后才能回滚。

## R2-Fix：Risk Level 恢复原值

Phase LLM-R2 初始实现曾调整了 3 个 tool 的 riskLevel：
- `create_schedule_items`: medium → high
- `schedule_plan`: medium → high
- `compose_timeline_event`: high → medium

**R2-Fix 已全部恢复原值**，原因：

1. **`actionBase()` 消费 riskLevel**：`requiresConfirmation: riskLevel !== "low"` — 改变 riskLevel 会改变 action 级确认语义
2. **`safety.test.ts` 验证 riskLevel**：`getAgentIntentRiskLevel()` 返回值会在测试中被断言
3. **`permission-resolver.ts`** 根据 `action.riskLevel` 决策
4. **`orchestration/execution-graph.ts`** 按 riskLevel 分组 batch/low/high
5. **`safety.ts`** 用 riskLevel 生成用户可见风险标签

风险等级重分类应先解耦 `riskLevel` 与行为语义，在后续专门 Phase 中处理。

### Rollback Metadata 审计结论

所有 16 个 write/draft tool 的 `rollback` 字段均为**预存**（pre-R2 已有），R2 只新增了 `supportsRollback` boolean 元数据。不存在「R2 新增假 rollback metadata」的情况。

## 为什么 R2 不改变工具行为

Phase LLM-R2 是纯元数据补充阶段：

- ✅ 新增 metadata 字段
- ✅ 调整 `create_schedule_items` riskLevel medium→high
- ✅ 调整 `compose_timeline_event` riskLevel high→medium
- ❌ 不改变任何 dryRun 函数代码
- ❌ 不改变任何 execute 函数代码
- ❌ 不改变确认规则
- ❌ 不改变 Policy Guard / Executor / rollback

## 为什么 Write Tool 必须 Confirmation

SunnyPanel 的安全模型基于：

> LLM plans and proposes → System validates and gatekeeps → User confirms → System executes with receipt → Rollback available

所有 write tool 的 `requiresConfirmation` 为 `true`，确保：
1. 用户看到拟执行动作的 dry-run 预览
2. 用户明确确认后才执行
3. 执行后生成 receipt（幂等保护）
4. 支持 rollback 的工具可撤销

即使 `riskLevel: "low"` 的 write tool（如 `cancel_schedule_item`），也需要走确认流程。

## 后续 LLM Tool Planner 如何消费这些 Metadata

LLM-R3（Tool Planner）将使用以下字段：

- `capability`：判断 tool 是 read / draft / write，选择合适的操作类型
- `inputSchema`：了解 tool 需要的参数格式
- `riskLevel`：评估风险
- `canRunWithoutConfirmation`：判断是否能直接执行，还是需要走确认流程
- `supportsDryRun`：判断是否能先生成预览
- `supportsExecute`：判断是否可执行
- `supportsRollback`：判断是否可回滚

### 当前 Tool 注册表（17 tools）

| Tool | capability | riskLevel | canRunWithoutConfirmation | supportsRollback |
|------|-----------|-----------|--------------------------|------------------|
| add_completion_note | write | high | false | true |
| append_plan_item | write | medium | false | true |
| cancel_schedule_item | write | low | false | true |
| complete_plan_item | write | high | false | true |
| compose_plan | draft | medium | true | true |
| compose_schedule_item | draft | medium | true | true |
| compose_timeline_event | draft | high | true | true |
| create_checklist | write | medium | false | true |
| create_schedule_items | write | medium | false | true |
| create_plan | write | medium | false | true |
| query_plan_progress | read | low | true | false |
| query_schedule | read | low | true | false |
| reschedule_item | write | medium | false | true |
| save_memory | write | medium | false | true |
| schedule_plan | write | medium | false | true |
| delete_record | write | high | false | true |
| modify_record | write | medium | false | true |
| weekly_review | write | medium | false | true |

## Naming Note: `AgentWriteIntentName`

Despite its name, `AgentWriteIntentName` includes read tools (`query_plan_progress`, `query_schedule`) and draft tools (`compose_plan`, `compose_schedule_item`, `compose_timeline_event`). These are included only for compatibility with the existing intent/executor type system.

**Tool `capability` metadata is the authoritative semantic source**, not the type name.

- Read tools (`capability: "read"`) must NOT: create pendingAction, enter Policy Guard, call execute, write to DB
- Draft tools (`capability: "draft"`) must NOT: call execute, write to DB (pendingAction creation follows confirmation path)
- Write tools (`capability: "write"`) MUST: go through dryRun → Policy Guard → PendingAction → confirmation → execute → receipt

Future cleanup: split into `AgentReadIntentName | AgentDraftIntentName | AgentWriteIntentName`.
