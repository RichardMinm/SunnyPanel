# SunnyPanel Agent 多智能体协作改造指南（Vibe Coding）

> 本文档是 **Agent 系统从「单 LLM 编排 + 确定性执行」演进为「LLM 驱动的多 Agent 协作」** 的总体指导文件。
> 目标是让 6 个专业 Agent（Plan / Schedule / Review / Memory / Content / Query）具备独立推理能力，通过 Agent Bus 协作，支撑复合意图的智能化处理。
>
> **本文档适合作为 Vibe Coding 的上下文输入**——AI 编码助手应优先理解当前架构瓶颈与阶段边界，再改代码。

---

## 1. 当前状态诊断

### 1.1 架构现状（已完成）

```
用户消息 → 构建上下文 → 编排器(LLM)拆解 → 意图解析(LLM+规则) → DryRun确认 → 执行持久化
                              ↓ compound 模式
                       DAG 执行图(并行层) → 批量确认 → 批量执行
```

| 模块 | 状态 | 说明 |
|------|------|------|
| **Pipeline** | 完成 | 6 步流水线，含确认/执行/持久化 |
| **Orchestrator** | 完成 | LLM 拆解 single/compound 意图为 TaskNode DAG |
| **Execution Graph** | 完成 | 拓扑分层 + 并行执行 + 批量确认 |
| **Specialized Agents** | 骨架 | 6 个 Agent 有定义但 `enrichIntent` 全为空 |
| **Agent Bus** | 基础 | 消息传递 + artifact 注入，但无持久化 |
| **Tool Registry** | 完成 | 13 个工具含 dryRun/execute/rollback 完整生命周期 |
| **Memory System** | 完成 | 向量检索 + 类型分类 + 相关性评分 |
| **Safety** | 完成 | 逐工具风险分级 + 前后快照 + 回滚策略 |
| **LLM Client** | 完成 | OpenAI 兼容 API + Function Calling + 重试 + token 统计 |

### 1.2 核心瓶颈：Agent 无自主推理

```typescript
// src/lib/agent/agents/run-specialized-agent.ts 当前实现：
const enriched = definition.enrichIntent
  ? (await definition.enrichIntent(baseIntent, input.promptContext, input.message)) ?? baseIntent
  : baseIntent;
//   ^^^^^^^^^^^^^^^^^ 永远为空 —— 所有 6 个 Agent 均未赋值
```

**现象**：

- 编排器是唯一调用 LLM 的地方，Agent 只做参数搬运
- `plan-agent.ts` 只有两行 export
- `schedule-agent.ts` 只有两行 export
- Agent 的"专业化"仅体现在 `supportedIntents` 白名单路由
- 编排器 prompt 不感知上下文（不知道当前有哪些计划、清单、记忆）

**结论**：当前系统是「单 LLM 编排 + 确定性工具执行」模式，不是真正的多 Agent 协作。

---

## 2. 改造目标

### 2.1 目标架构

```
用户消息
    │
    ▼
┌─────────────────────────────────────────────────┐
│  Orchestrator (编排器)                            │
│  ─ 感知完整 workpace 上下文 (plans/checklists/    │
│    timeline/memories)                             │
│  ─ 拆解为 TaskNode DAG                            │
│  ─ 执行中可重规划 (replan)                         │
└──────────────┬──────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────┐
│  Execution Graph (DAG 执行引擎)                   │
│  ─ 拓扑分层并行执行                               │
│  ─ 每层调用对应 Specialized Agent                  │
│  ─ Agent 产出通过 Bus 向下游注入                   │
└──────┬──────────────────────────────────────────┘
       │
       ▼
┌────────────────────────────────────────────────┐
│  Specialized Agents (LLM-powered)               │
│  ┌─────────┐ ┌──────────┐ ┌────────┐           │
│  │  Plan   │ │ Schedule │ │ Review │  ...      │
│  │  Agent  │ │  Agent   │ │ Agent  │           │
│  │  ─ LLM  │ │  ─ LLM   │ │  ─ LLM │           │
│  │  ─ 专属 │ │  ─ 专属   │ │  ─ 专属 │           │
│  │  prompt │ │  prompt   │ │  prompt │          │
│  └─────────┘ └──────────┘ └────────┘           │
│  ┌─────────┐ ┌──────────┐ ┌────────┐           │
│  │ Memory  │ │ Content  │ │ Query  │           │
│  │  Agent  │ │  Agent   │ │ Agent  │           │
│  └─────────┘ └──────────┘ └────────┘           │
└────────────────────────────────────────────────┘
       │
       ▼
┌────────────────────────────────────────────────┐
│  Agent Bus (消息总线)                            │
│  ─ 类型化 artifact schema                       │
│  ─ 冲突合并策略                                  │
│  ─ 执行完成后记忆主动归档                         │
└────────────────────────────────────────────────┘
```

### 2.2 非目标（本阶段不做）

- Agent 内 ReAct 多轮推理循环（留到 Phase 2）
- Agent 间互相委派（delegate）
- 长时间运行 Agent 的检查点/恢复
- 多用户协同 Agent

---

## 3. 目标目录结构（实施后）

```text
src/lib/agent/
  agents/
    plan-agent.ts                 # Plan Agent 含独立 LLM 推理 + 专属 system prompt
    schedule-agent.ts             # Schedule Agent 含独立 LLM 推理 + 专属 system prompt
    review-agent.ts               # Review Agent 含独立 LLM 推理 + 专属 system prompt
    memory-agent.ts               # Memory Agent 含独立 LLM 推理 + 专属 system prompt
    content-agent.ts              # Content Agent 含独立 LLM 推理 + 专属 system prompt
    query-agent.ts                # Query Agent 含独立 LLM 推理 + 专属 system prompt
    run-specialized-agent.ts      # Agent 执行入口（已有，需增强）
    registry.ts                   # Agent 注册表（已有，需补 enrichIntent）
    router.ts                     # Agent 路由（已有，不变）
    bus.ts                        # Agent 总线（已有，需增加类型化 schema）
    types.ts                      # 类型定义（已有，需增加 AgentBus 类型化 schema）
  chat-pipeline/
    orchestration-step.ts         # 编排步骤（已有，需注入上下文 + 支持 replan）
  orchestration/
    orchestrator.ts               # 编排器（已有，需注入上下文）
    execution-graph.ts            # 执行图（已有，需增加 Agent 级错误重试）
    parallel-layers.ts            # 并行分层（已有，不变）
    replan.ts                     # 重规划逻辑（已有文件，需接入 pipeline）
    types.ts                      # 编排类型（已有，不变）
  prompts/
    orchestrator.ts               # 编排器 prompt（已有，需注入上下文）
    plan.ts                       # Plan Agent prompt（已有，需审查增强）
    schedule.ts                   # Schedule Agent prompt（已有，需审查增强）
    review.ts                     # Review Agent prompt（已有，需审查增强）
    memory.ts                     # Memory Agent prompt（已有，需审查增强）
    content.ts                    # Content Agent prompt（已有，需审查增强）
    query.ts                      # Query Agent prompt（已有，需审查增强）
  memory.ts                       # 记忆检索（已有，需增加主动归档入口）
  tool-registry.ts                # 工具注册（已有，需增加 outputSchema）
  function-tools.ts               # Function Calling（已有，需细化参数 schema）
  schemas.ts                      # 类型定义（已有，需审查 AgentBusOutputSchema）
```

---

## 4. 分阶段实施

> **规则**：完成上一阶段验收清单前，不要启动下一阶段；每阶段结束运行 `npx tsc --noEmit`、`npm run build`。

### Phase 1 — Agent 自主推理（最关键）

**目标**：让 6 个 Agent 各自拥有独立的 LLM 推理能力和专属 system prompt。

**现状**：

```typescript
// src/lib/agent/agents/registry.ts —— 当前所有 Agent 的 enrichIntent 均未赋值
export const planAgentDefinition: SpecializedAgentDefinition = {
  id: "plan",
  role: "plan",
  supportedIntents: ["create_plan", "compose_plan", "append_plan_item", "complete_plan_item", "schedule_plan", "evaluate_plan"],
  systemPromptHint: "计划创建、拆解、评估与清单联动",
  // enrichIntent 未赋值 ← 核心缺失
};
```

**任务**：

1. **为每个 Agent 实现 `enrichIntent` 方法**：
   ```typescript
   // 以 PlanAgent 为例 —— src/lib/agent/agents/plan-agent.ts
   import { completeStructured } from "../llm/complete-structured";
   import { buildPlanAgentSystemPrompt } from "../prompts/plan";
   import { parseAgentIntentResult } from "../schemas";
   import type { AgentIntent } from "../schemas";
   import type { AgentPromptContext } from "../prompts";

   export const enrichPlanIntent = async (
     intent: AgentIntent,
     context: AgentPromptContext,
     message: string,
   ): Promise<AgentIntent | null> => {
     const result = await completeStructured({
       fallback: () => intent,  // 降级：LLM 失败则原样返回
       messages: [
         { role: "system", content: buildPlanAgentSystemPrompt(context) },
         {
           role: "user",
           content: [
             `用户原话：${message}`,
             `当前意图：${intent.intent}`,
             `已有参数：${JSON.stringify(intent.args, null, 2)}`,
           ].join("\n"),
         },
       ],
       parse: (raw) => parseAgentIntentResult(raw),
       temperature: 0.3,
     });

     return result?.data ?? intent;
   };
   ```

2. **审查并增强每个 Agent 的专属 system prompt**：
   - `prompts/plan.ts`：体现计划领域知识（目标拆解原则、SMART 验收标准、优先级矩阵、风险识别）
   - `prompts/schedule.ts`：体现排程领域知识（时间冲突检测、精力分配、deadline 缓冲、番茄钟适配）
   - `prompts/review.ts`：体现复盘领域知识（完成率分析、叙事缺口、趋势判断、建议生成原则）
   - `prompts/memory.ts`：体现记忆领域知识（信息压缩原则、类型判断边界、遗忘曲线、去重策略）
   - `prompts/content.ts`：体现内容领域知识（写作风格保持、Timeline 叙事连贯性、公开/私有内容边界）
   - `prompts/query.ts`：体现查询领域知识（进度聚合方式、跨计划关联分析）

3. **在 Agent 注册表中绑定 `enrichIntent`**：
   ```typescript
   // src/lib/agent/agents/registry.ts
   import { enrichPlanIntent } from "./plan-agent";
   import { enrichScheduleIntent } from "./schedule-agent";
   // ...

   export const planAgentDefinition: SpecializedAgentDefinition = {
     id: "plan",
     role: "plan",
     supportedIntents: [...],
     systemPromptHint: "计划创建、拆解、评估与清单联动",
     enrichIntent: enrichPlanIntent,  // ← 绑定
   };
   ```

4. **确保 `enrichIntent` 调用方传入完整上下文**：
   - `runSpecializedAgentForTask` 中已将 `input.promptContext` 传入
   - `executeOrchestrationGraph` 中 `processTask` 调用时需确保 `promptContext` 传递到 `enrichIntent`

**验收**：

- [ ] 6 个 Agent 的 `enrichIntent` 均已实现并绑定
- [ ] 每个 Agent 有独立的 system prompt（至少 15 行）
- [ ] `npx tsc --noEmit` 通过
- [ ] 在测试环境发一条"帮我制定考研计划"消息，编排器拆解到 Plan Agent 后，Agent 的 `enrichIntent` 被调用并返回增强后的意图

---

### Phase 2 — 编排器感知上下文

**目标**：编排器拆解任务时能看到当前 workspace 状态，提高拆解准确性。

**现状**：

```typescript
// src/lib/agent/prompts/orchestrator.ts 当前 user prompt 仅有用户消息
export const buildOrchestratorUserPrompt = (message: string) => `用户消息：${message}`;
```

**任务**：

1. **为编排器注入上下文摘要**：

   ```typescript
   // src/lib/agent/prompts/orchestrator.ts
   import type { AgentPromptContext } from "../prompts";

   export const buildOrchestratorUserPrompt = (message: string, context: AgentPromptContext) => {
     const planLines = context.plans
       .slice(0, 8)
       .map(p => `- [${p.state}/${p.priority}] ${p.title}${p.dueDate ? ` (截止: ${p.dueDate})` : ""}`)
       .join("\n");

     const memoryLines = (context.memories ?? [])
       .filter(m => m.confidence >= 0.5)
       .slice(0, 5)
       .map(m => `- [${m.type}] ${m.title}: ${m.content}`)
       .join("\n");

     const checklistLines = context.checklists
       .slice(0, 5)
       .map(c => {
         const progress = c.totalItems ? `${c.completedItems ?? 0}/${c.totalItems}` : "?";
         return `- ${c.title} (${progress})`;
       })
       .join("\n");

     const timelineSummary = (context.timelineEvents ?? [])
       .slice(0, 3)
       .map(e => `- ${e.eventDate}: ${e.title}`)
       .join("\n");

     return [
       "## 当前工作区状态",
       `### 计划 (${context.plans.length} 个)`,
       planLines || "无",
       `### 清单 (${context.checklists.length} 个)`,
       checklistLines || "无",
       `### Timeline 最近事件`,
       timelineSummary || "无",
       memoryLines ? `### 相关长期记忆\n${memoryLines}` : "",
       "---",
       `## 用户消息`,
       message,
     ].filter(line => line !== null).join("\n");
   };
   ```

2. **更新编排器 system prompt**，增加对上下文的引用说明：

   ```typescript
   export const buildOrchestratorSystemPrompt = (context: AgentPromptContext) => `
   你是 SunnyPanel 的编排器。你可以看到用户当前的工作区状态（计划、清单、Timeline、长期记忆）。
   规则：
   1. 如果用户的请求已匹配到现有计划或清单，优先复用——不要创建重复项。
   2. 排期类任务如果涉及已有计划，必须在 args.planId 中引用。
   3. 利用长期记忆中的偏好来调整拆解方式（例如用户偏好「先拆阶段再排日程」）。
   ...（其余不变）
   `;
   ```

3. **更新 `runOrchestrator` 调用方**，传递 context 参数：
   - `orchestration-step.ts` 中 `runOrchestrator(message, context)` 已传递 context，但 prompt 函数未使用——修改 prompt 函数签名即可。

**验收**：

- [ ] 编排器 user prompt 包含计划、清单、Timeline、记忆摘要
- [ ] 发"把考研计划排进日程"时，编排器能识别已有"考研计划"并引用其 planId（而非创建新计划）
- [ ] 编排器日志中的 `reasoning` 包含对现有上下文的引用

---

### Phase 3 — 执行图支持重规划

**目标**：执行图中某任务失败或产生孤儿节点时，自动触发编排器重新规划，而非直接返回错误。

**现状**：

- `orchestration/replan.ts` 文件已存在但 **未被 pipeline 调用**
- `executeOrchestrationGraph` 中 `orphanedTaskIds` 被检测后仅生成提示消息，不做恢复
- Agent 执行失败（`runSpecializedAgentForTask` 返回 null）时直接跳过

**任务**：

1. **接入 `replan.ts` 到执行图**：

   ```typescript
   // src/lib/agent/orchestration/execution-graph.ts 中增加 replan 逻辑
   import { replanFromFailure } from "./replan";

   // 在 executeOrchestrationGraph 的 processTask 中：
   const processTask = async (task: TaskNode) => {
     // ... 现有逻辑 ...
     const specialized = await runSpecializedAgentForTask(mergedTask, {...});

     if (!specialized.intent) {
       // 新增：Agent 推理失败，触发局部重规划
       const replanned = await replanFromFailure({
         failedTask: task,
         originalPlan: plan,
         reason: "Agent 推理无产出",
         message,
         context: promptContext!,
       });
       // 如有新任务替换，将其注入当前执行层
       // ...
     }
   };
   ```

2. **实现 `replanFromFailure`**：

   ```typescript
   // src/lib/agent/orchestration/replan.ts
   import { runOrchestrator } from "./orchestrator";
   import type { AgentPromptContext } from "../prompts";
   import type { OrchestratorPlan, TaskNode } from "./types";

   export const replanFromFailure = async (input: {
     context: AgentPromptContext;
     failedTask: TaskNode;
     message: string;
     originalPlan: OrchestratorPlan;
     reason: string;
   }): Promise<OrchestratorPlan | null> => {
     const replanMessage = [
       `原计划「${input.originalPlan.reasoning}」中任务「${input.failedTask.label}」执行失败：${input.reason}`,
       `请重新规划剩余工作。已完成的任务：${input.originalPlan.tasks.filter(t => t.id !== input.failedTask.id).map(t => t.label).join("、")}`,
       `原始用户请求：${input.message}`,
     ].join("\n");

     const result = await runOrchestrator(replanMessage, input.context);
     return result ?? null;
   };
   ```

3. **在 `orchestration-step.ts` 中连接 replan**：
   - 当 `executeOrchestrationGraph` 返回的结果中 `executedCount === 0` 且 `orphanedTaskIds.length > 0` 时，触发 replan 重新尝试。

**验收**：

- [ ] 构造场景：编排器拆解 A→B→C，给 B 无法解析的参数，系统应自动重规划 B 的替代方案
- [ ] replan 日志出现在 AgentRun 的 trace 中
- [ ] 重规划次数有上限（建议 ≤ 2 次）

---

### Phase 4 — Agent Bus 类型化

**目标**：Agent 间传递的数据有明确的类型约定，下游 Agent 能安全消费上游产出。

**现状**：

```typescript
// src/lib/agent/agents/bus.ts
export type AgentBusMessage = {
  payload: Record<string, unknown>;  // ← 无类型约束
  // ...
};
```

**任务**：

1. **定义每个 Agent Role 的标准输出 schema**：

   ```typescript
   // src/lib/agent/agents/types.ts 新增
   export type PlanAgentArtifact = {
     planId: number;
     planTitle: string;
     phases: number;
     checklistId?: number;
     visibility: "private" | "public";
   };

   export type ScheduleAgentArtifact = {
     scheduleItemIds: number[];
     dateRange: [string, string];
     planId?: number;
   };

   export type MemoryAgentArtifact = {
     memoryId: number;
     title: string;
     type: string;
     confidence: number;
   };

   export type AgentRoleArtifactMap = {
     content: { timelineEventId: number };
     memory: MemoryAgentArtifact;
     plan: PlanAgentArtifact;
     query: { report: string };
     review: { planReviewId: number; suggestions: number };
     schedule: ScheduleAgentArtifact;
   };
   ```

2. **增强 `publishTaskArtifact` 的类型安全**：

   ```typescript
   export const publishTaskArtifact = <T extends AgentRole>(
     bus: AgentBusState,
     input: {
       from: T;
       payload: AgentRoleArtifactMap[T];
       taskId: string;
     },
   ): AgentBusState => // ...
   ```

3. **增强 `mergeTaskArgsWithBus` 使用标准化的 artifact key**：

   ```typescript
   // 当下游 Agent 声明 dependsOn: ["t1"] 时，
   // mergeTaskArgsWithBus 从 t1 的 artifact 中安全提取 planId / scheduleItemIds 等，
   // 并按 Agent 角色推断需要注入哪些字段
   ```

**验收**：

- [ ] 6 个 Agent 的 artifact 类型均定义完整
- [ ] `npx tsc --noEmit` 在严格模式下无类型错误
- [ ] 复合意图（Plan → Schedule）执行后，Schedule Agent 能通过 Bus 获取到 planId

---

### Phase 5 — Function Calling 参数细化

**目标**：当 LLM 通过 function calling 直接返回结构化意图时，参数不再是粗粒度的 `sourceText`。

**现状**：

```typescript
// src/lib/agent/function-tools.ts
const intentParameterHints = {
  compose_plan: {
    goal: { description: "计划目标", type: "string" },
    title: { description: "计划标题", type: "string" },
  },
  // 大部分工具仅有 sourceText
};
```

**任务**：

1. **为所有 13 个工具定义完整的 function calling schema**：

   ```typescript
   const intentParameterHints: Record<AgentWriteIntentName, Record<string, { description: string; type: string; enum?: string[] }>> = {
     compose_plan: {
       goal: { description: "计划目标（一句话描述要达成什么成果）", type: "string" },
       title: { description: "计划标题（简洁醒目）", type: "string" },
       dueDate: { description: "期望完成日期 YYYY-MM-DD", type: "string" },
       priority: { description: "优先级", type: "string", enum: ["high", "medium", "low"] },
       scope: { description: "范围说明（包含/不包含什么）", type: "string" },
     },
     compose_schedule_item: {
       date: { description: "日期 YYYY-MM-DD", type: "string" },
       sourceText: { description: "用户原始排期描述", type: "string" },
       planId: { description: "关联计划 ID（若有）", type: "number" },
       priority: { description: "优先级", type: "string", enum: ["high", "medium", "low"] },
     },
     create_plan: {
       title: { description: "计划标题", type: "string" },
       description: { description: "计划说明（1-3 句话）", type: "string" },
       dueDate: { description: "截止日期", type: "string" },
       priority: { description: "优先级", type: "string", enum: ["high", "medium", "low"] },
       executionMode: { description: "执行模式", type: "string", enum: ["manual", "agent", "hybrid"] },
     },
     save_memory: {
       content: { description: "要记住的内容（一句话）", type: "string" },
       title: { description: "记忆标题", type: "string" },
       type: { description: "记忆类型", type: "string", enum: ["preference", "fact", "project_context", "workflow_rule", "writing_style"] },
     },
     // ... 其余 9 个工具同理
   };
   ```

2. **将 `required` 字段从任意第一个 key 改为真正的必填字段**：

   ```typescript
   // 当前：required: Object.keys(properties).slice(0, 1), // 只有一个必填
   // 改为：
   const requiredFields: Partial<Record<AgentWriteIntentName, string[]>> = {
     compose_plan: ["goal", "title"],
     create_plan: ["title"],
     save_memory: ["content", "title"],
     compose_schedule_item: ["date"],
     // ...
   };
   ```

**验收**：

- [ ] 13 个工具均有完整的 parameters schema（每个至少 2-5 个参数）
- [ ] `required` 数组反映真实的必填字段
- [ ] Function calling 模式下 LLM 返回的 args 包含结构化字段（不再全是 sourceText）

---

### Phase 6 — 记忆主动归档

**目标**：执行图完成后，将执行过程中的关键模式自动写入长期记忆，不需用户显式说"记住..."。

**现状**：`save_memory` 仅在用户显式请求时触发。记忆检索只在 pipeline 开头的 context-building 阶段。

**任务**：

1. **在 `executeOrchestrationGraph` 完成后增加后处理步骤**：

   ```typescript
   // src/lib/agent/orchestration/execution-graph.ts
   import { autoArchiveMemoryFromExecution } from "../memory";

   // executeOrchestrationGraph 返回前：
   if (plan.mode === "compound" && sortedProposals.length > 1) {
     // 复合意图执行完成后，异步归档记忆（不阻塞响应）
     autoArchiveMemoryFromExecution({
       message,
       plan,
       proposals: sortedProposals,
       userConfirmed: true,  // 取决于确认流程
     }).catch(err => logAgentEvent("warn", "memory.auto_archive_failed", { error: err }));
   }
   ```

2. **实现 `autoArchiveMemoryFromExecution`**：

   ```typescript
   // src/lib/agent/memory.ts 新增
   export const autoArchiveMemoryFromExecution = async (input: {
     message: string;
     plan: OrchestratorPlan;
     proposals: ProposedAgentAction[];
     userConfirmed: boolean;
   }) => {
     // 规则驱动的提取逻辑：
     // 1. 从 message 中检测用户偏好模式（如「以后都...」「每次都...」）
     // 2. 从复合意图的成功执行中提取 workflow pattern
     // 3. 从 decisions 中提取"用户偏好某种工作方式"的信号
     // 4. 通过 memory-agent 的 LLM 调用蒸馏为长期记忆

     // 示例：用户说「以后制定计划都按阶段拆解，每个阶段不超过一周」
     // → 自动写入 memory type=workflow_rule, confidence=0.8
   };
   ```

3. **在执行过程中给 memory-agent 增加"观测"能力**：
   - 在 Agent Bus 上，memory-agent 作为特殊消费者，监听其他 Agent 的 artifact
   - 当检测到用户表现出模式偏好时，主动提案一条 `save_memory`

**验收**：

- [ ] 用户说「以后排日程都把周五下午空出来」后，下一次排程自动避开周五下午
- [ ] 复合意图执行完成后，`agent-memories` 集合有新记录
- [ ] 自动归档不阻塞正常响应（异步 + 错误吞掉）

---

### Phase 7 — Agent 内 ReAct 循环（可选，P2）

**目标**：写操作 Agent 支持「推理 → 草稿 → 验证 → 调整 → 最终提案」的多轮循环。

**任务**：

1. 在 `SpecializedAgentDefinition` 中增加 `maxReasoningSteps` 字段（默认 1）
2. 在 `runSpecializedAgentForTask` 中实现简单的循环：
   ```
   for step in 1..maxReasoningSteps:
     intent = await enrichIntent(currentIntent)
     dryRun = await dryRunAgentIntent(intent)
     if dryRun 无需调整: break
     currentIntent = applyAdjustment(intent, dryRun.feedback)
   ```
3. 首期仅在 Plan Agent 和 Schedule Agent 上启用 `maxReasoningSteps = 3`

**验收**：

- [ ] Plan Agent 在 plan-composer 检测到输入模糊时，能自动补全 goal/scope 再提案
- [ ] ReAct 循环有步数上限和 token 消耗日志

---

## 5. 关键实现片段

### 5.1 Agent enrichIntent 模板（Phase 1 核心）

```typescript
// src/lib/agent/agents/plan-agent.ts
import { completeStructured } from "../llm/complete-structured";
import { buildPlanAgentSystemPrompt } from "../prompts/plan";
import { parseAgentIntentResult } from "../schemas";
import type { AgentIntent } from "../schemas";
import type { AgentPromptContext } from "../prompts";

export const enrichPlanIntent = async (
  intent: AgentIntent,
  context: AgentPromptContext,
  message: string,
): Promise<AgentIntent | null> => {
  const result = await completeStructured({
    fallback: () => intent,
    messages: [
      { role: "system", content: buildPlanAgentSystemPrompt(context) },
      {
        role: "user",
        content: [
          `用户原话：${message}`,
          `编排器分配的意图：${intent.intent}`,
          `已有参数：${JSON.stringify(intent.args, null, 2)}`,
          context.plans.length > 0
            ? `现有计划：\n${context.plans.map(p => `- [${p.state}] ${p.title} (id=${p.id})`).join("\n")}`
            : "",
        ].filter(Boolean).join("\n"),
      },
    ],
    parse: (value) => parseAgentIntentResult(value),
    temperature: 0.3,
  });

  return result?.data ?? intent;
};
```

### 5.2 Plan Agent System Prompt 骨架

```typescript
// src/lib/agent/prompts/plan.ts
import type { AgentPromptContext } from "../prompts";

export const buildPlanAgentSystemPrompt = (context: AgentPromptContext) => `
你是 SunnyPanel 的 Plan Agent，专门负责计划创建、拆解、评估与清单联动。

当前时间：${context.now}

## 你的领域知识
1. **计划拆解原则**：每个计划按可交付成果拆分为阶段（2-5 个），每阶段包含 3-7 个可执行项。
2. **SMART 验收**：每个成功标准必须具体、可测量。避免"做得更好"这类模糊标准。
3. **优先级判断**：
   - high: 有硬性 deadline 或阻塞其他计划的上游工作
   - medium: 有目标截止日期但可弹性调整
   - low: 探索性工作、nice-to-have
4. **作用域边界**：明确列出"不在此计划范围内的内容"，避免范围蔓延。
5. **风险识别**：每条风险需说明可能性（高/中/低）和影响（高/中/低）。

## 现有计划（避免重复）
${context.plans.map(p => `- [${p.state}/${p.priority}] ${p.title}`).join("\n") || "暂无"}

## 输出格式
只输出 JSON，不要 Markdown：
{
  "intent": "create_plan" | "compose_plan" | "append_plan_item" | ...,
  "args": { /* 工具所需的完整参数 */ },
  "confidence": 0.0-1.0
}
`;
```

### 5.3 编排器上下文注入（Phase 2 核心）

```typescript
// src/lib/agent/prompts/orchestrator.ts
import type { AgentPromptContext } from "../prompts";

export const buildOrchestratorUserPrompt = (
  message: string,
  context: AgentPromptContext,
) => {
  const activePlans = context.plans.filter(p => p.state === "active");
  const upcomingDeadlines = context.plans
    .filter(p => p.dueDate)
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))
    .slice(0, 5);

  return [
    "## 工作区当前状态",
    `活跃计划 ${activePlans.length}/${context.plans.length} 个`,
    activePlans.length > 0
      ? activePlans.map(p =>
          `- [${p.priority}] ${p.title} (id=${p.id}) ${p.dueDate ? `截止 ${p.dueDate}` : ""}`
        ).join("\n")
      : "无活跃计划",
    upcomingDeadlines.length > 0
      ? `\n即将到期：\n${upcomingDeadlines.map(p => `- ${p.dueDate}: ${p.title}`).join("\n")}`
      : "",
    (context.memories ?? []).length > 0
      ? `\n相关长期记忆：\n${context.memories!.filter(m => m.confidence >= 0.5).slice(0, 5).map(m => `- [${m.type}] ${m.title}: ${m.content}`).join("\n")}`
      : "",
    "---",
    `用户消息：${message}`,
  ].filter(Boolean).join("\n");
};
```

### 5.4 Agent Bus 类型化产出（Phase 4 核心）

```typescript
// src/lib/agent/agents/types.ts 新增

import type { AgentRole } from "../orchestration/types";

export type PlanAgentArtifact = {
  planId: number;
  planTitle: string;
  phases: number;
  checklistId?: number;
  visibility: "private" | "public";
};

export type ScheduleAgentArtifact = {
  scheduleItemIds: number[];
  dateRange: [string, string];
  planId?: number;
};

export type MemoryAgentArtifact = {
  memoryId: number;
  title: string;
  type: string;
  confidence: number;
};

export type AgentRoleArtifactMap = {
  content: { timelineEventId: number };
  memory: MemoryAgentArtifact;
  plan: PlanAgentArtifact;
  query: { report: string };
  review: { planReviewId: number; suggestions: number };
  schedule: ScheduleAgentArtifact;
};

// bus.ts 中 publishTaskArtifact 签名改为：
export const publishTaskArtifact = <T extends AgentRole>(
  bus: AgentBusState,
  input: { from: T; payload: AgentRoleArtifactMap[T]; taskId: string },
): AgentBusState => // ...
```

---

## 6. 与其他系统的集成点

| 系统 | 影响 |
|------|------|
| **Dashboard Workbench** | Agent 推理过程需要在 `AgentThinkingPanel` 中展示 per-agent 的思考步骤 |
| **AgentRun** | `AgentRun` collection 中增加 `agentTrace` 字段，记录每个 Agent 的推理步骤 |
| **Intent Trace** | `intent-trace.ts` 增加 `agentId` 字段，标注每个步骤由哪个 Agent 执行 |
| **Token Usage** | `token-usage.ts` 增加 per-agent token 统计，而非仅总量 |
| **Logging** | `logger.ts` 增加 `agentId` 维度，方便按 Agent 过滤日志 |
| **Rollback** | 复合意图的批量回滚需按 Agent 分组，各自独立回滚（当前已支持） |

---

## 7. 测试清单

### 手动测试

1. 发一条复合意图消息（如"帮我制定考研计划，然后排进下周日程，再设一个每周五复盘"），检查：
   - 编排器拆解出 3+ 个 TaskNode
   - Plan Agent 被调用并返回增强意图
   - Schedule Agent 从 Bus 获取 planId
   - Review Agent 创建了 PlanReview 草案
2. 发一条模糊消息（如"安排一下下周"），检查编排器返回 `clarify` 而非乱拆解
3. 停用 LLM（删除 API key），发消息检查所有 Agent 走 fallback，整条 pipeline 不崩溃
4. 检查 AgentRun collection 的 trace 中每个 Agent 有独立的推理步骤记录

### 自动化（建议 Phase 3 后）

- `tests/agent/orchestrator-context.test.ts`：编排器在有/无上下文下的拆解准确性对比
- `tests/agent/agent-enrich.test.ts`：每个 Agent 的 enrichIntent 单元测试（用 mock LLM 或固定 fixture）
- `tests/agent/bus-artifact-type.test.ts`：Agent Bus artifact 类型正确性
- `tests/agent/replan.test.ts`：执行图失败→重规划的端到端测试

---

## 8. Vibe Coding 行为约束（给 AI）

1. **先读本文档 + 目标阶段**，不要擅自跳阶段或改非 Agent 相关文件。
2. **禁止**在 Agent 的 `enrichIntent` 中绕过 `completeStructured` 的 `fallback` 机制——每个 LLM 调用必须有降级路径。
3. **禁止**在 Agent system prompt 中硬编码具体数据（如具体计划标题）；所有数据通过 context 注入。
4. **禁止**移除 `parseAgentIntentResult` 的类型校验——响应解析必须经过 schema 验证。
5. 新增 LLM 调用必须带 `temperature` 参数和 token 统计（`completeStructured` 已封装）。
6. 改动 Agent 注册表后 **必须** 确保 `registry.ts` 和 `router.ts` 的一致性。
7. 遇到 LLM 响应解析失败时，**必须**走 fallback 而非抛异常。
8. 完成阶段后更新本文档底部 **实施状态** 表。

---

## 9. 风险与对策

| 风险 | 对策 |
|------|------|
| 每 Agent 增加 LLM 调用 → token 消耗大幅上升 | 首期每个 Agent 用 `temperature=0.3` 精简 prompt；非写操作 Agent（Query/Content）可先用小模型 |
| 编排器感知上下文后 prompt 过长 → 超 token 窗口 | 每个类目（plans/checklists/memories）截断到前 N 条；用 `estimateTokenCount` 做预算控制 |
| 多 Agent 并行执行 → LLM 并发调用开销 | `executeOrchestrationGraph` 中 `Promise.all` 已做并行；增加并发请求限流（最多 3 个同时） |
| ReAct 循环 → 用户等待时间大幅增加 | Phase 7 为 P2，默认 `maxReasoningSteps=1`；启用前后用 feature flag 控制 |
| Agent 专属 prompt 质量差 → 推理反而更差 | Phase 1 的 prompt 模板先用简单规则验证，后续再做 A/B 对比优化 |

---

## 10. 实施状态（随开发更新）

| 阶段 | 状态 | 备注 |
|------|------|------|
| Phase 1 Agent 自主推理 | 已完成 | 6 个 `enrichIntent` + 专属 prompt + `enrich-intent.ts` |
| Phase 2 编排器感知上下文 | 已完成 | `buildOrchestratorUserPrompt(message, context)` |
| Phase 3 执行图重规划 | 已完成 | `replanAfterTaskFailure` 接入，上限 2 次 |
| Phase 4 Agent Bus 类型化 | 已完成 | `AgentRoleArtifactMap` + 类型化 `publishTaskArtifact` |
| Phase 5 Function Calling 参数细化 | 已完成 | 13 工具完整 schema + 真实 `required` |
| Phase 6 记忆主动归档 | 已完成 | `autoArchiveMemoryFromExecution` 异步归档 |
| Phase 7 Agent ReAct 循环 | 未开始 | P2 可选，本期未做 |

---

## 11. 参考链接

- 当前编排器 prompt：`src/lib/agent/prompts/orchestrator.ts`
- 当前 Agent 注册表：`src/lib/agent/agents/registry.ts`
- 当前 Agent 执行入口：`src/lib/agent/agents/run-specialized-agent.ts`
- 当前执行图：`src/lib/agent/orchestration/execution-graph.ts`
- 当前工具注册：`src/lib/agent/tool-registry.ts`
- 当前记忆系统：`src/lib/agent/memory.ts`
- 当前 LLM 客户端：`src/lib/agent/client.ts`
- 重规划文件（未被使用）：`src/lib/agent/orchestration/replan.ts`
- 架构方向记忆：项目 memory 中的 `agent-architecture-direction`

---

**给 AI 的一句话**：SunnyPanel Agent 已有多 Agent 协作骨架（编排器 + DAG + Bus + 工具安全层），但 Agent 没有自主推理。按 Phase 1→7 顺序落地：Phase 1 让 Agent 学会思考，Phase 2 让编排器看清战场，Phase 3 让执行图能摔倒重来，Phase 4-6 让协作更精密。每一步都必须保持 fallback 路径不中断。
