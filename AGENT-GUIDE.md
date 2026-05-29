# SunnyPanel Agent 架构指南

> 本文档是 Agent 系统改造的总体指导文件。目标是：**从单管道规则驱动，演进为 LLM 驱动的多任务智能编排系统**。
>
> 本文档适合作为 Vibe Coding 的上下文输入——AI 编码助手应优先理解本文档的设计意图，再实施具体代码。

---

## 1. 产品定位

**SunnyPanel 是单用户个人长期操作系统**，用于写作、笔记、计划、时间线、内容运营与复盘。

Agent 的职责不是通用聊天，而是**事务型编排**：理解用户的复合意图，拆解为可执行任务，协调多个专业能力完成工作。

---

## 2. 架构哲学：LLM 驱动 vs 规则驱动

### 核心原则

| 原则 | 说明 |
|------|------|
| **LLM 负责决策，代码负责执行** | LLM 决定「做什么、为什么、怎么做」，代码负责「把事做成」 |
| **意图理解用 LLM，实体操作用规则** | 理解模糊的自然语言→LLM；数据库读写/冲突检测→规则代码 |
| **编排用 LLM，专业工具用代码** | 任务拆解和路由→LLM；具体执行每个子任务→代码 |
| **用户可干预每一步** | dry-run + 确认机制保留，但支持批量确认 |
| **降级路径必须存在** | LLM 不可用时，关键词规则作为最低可用路径 |

### 什么应该用 LLM

- 理解复合/模糊的用户意图
- 计划拆解（领域知识推理）
- 智能排期（优先级、精力、依赖）
- 周报语义分析（洞察而非统计）
- 多任务编排路由

### 什么应该用代码规则

- 数据库 CRUD
- 实体匹配与冲突检测
- 权限与安全校验
- Schema 校验
- 时间/日期归一化
- AgentRun 审计记录

---

## 3. 当前架构评估

```
当前 Pipeline:
  用户消息 → 构建上下文(规则) → 编排器(LLM)拆解 → 意图解析(LLM + 启发式兜底)
           → DryRun(规则) → Execute(规则) → 持久化 + 审计

  复合意图分支:
  编排器 compound → DAG 执行图(拓扑分层并行) → 批量确认 → 批量执行

LLM 调用点:
  - 编排器: 意图拆解 single/compound + TaskNode DAG (temperature=0.2)
  - 意图解析: LLM 统一解析 + 13 关键词候选集兜底 (temperature=0.1)
  - 计划拆解: plan-decomposer.ts
  - 日程推理: schedule-time-llm.ts
  - 周报语义: weekly-review-llm.ts (temperature=0.45)
  - Function Calling: 意图结构化提取 (temperature=0.1)
  - 未来: 每个 Specialized Agent 独立 LLM 推理 (see AGENT-MULTI-V2-GUIDE.md)

已解决:
  - 复合意图: Orchestrator + ExecutionGraph + 批量确认 已完成
  - 编排层: orchestrator.ts + execution-graph.ts + parallel-layers.ts 已完成
  - Agent 专业化: 6 Agent registry + router + bus + 50+ dashboard 组件 已完成
  - 排期语义: schedule-composer.ts 含 LLM 日期推理 已完成
  - 周报语义: weekly-review-llm.ts 增强规则快照 已完成

待解决 (see AGENT-MULTI-V2-GUIDE.md):
  - Agent enrichIntent 均为空，Agent 无独立 LLM 推理
  - 编排器 prompt 不感知 workspace 上下文
  - 执行图不支持 replan
  - Agent Bus 无类型化 artifact schema
```

### 现有核心模块

| 模块 | 路径 | 职责 | 驱动方式 |
|------|------|------|---------|
| 编排器 | `orchestration/orchestrator.ts` | LLM 拆解意图 → TaskNode DAG | LLM + 启发式兜底 |
| 执行图 | `orchestration/execution-graph.ts` | DAG 拓扑分层并行执行 | 规则 + Agent 路由 |
| Agent 注册 | `agents/registry.ts` | 6 Agent 定义与意图映射 | 配置 |
| Agent 总线 | `agents/bus.ts` | 消息传递 + artifact 注入 | 规则 |
| 意图解析 | `intent/llm-unified.ts` | LLM 优先 + 13 关键词候选集 | LLM + 关键词 |
| 意图启发式 | `intent/heuristics/` | 13 个关键词解析器 | 关键词 |
| 工具注册 | `tool-registry.ts` | 13 工具 dryRun/execute/rollback | 规则 |
| 工具执行 | `tools/`、`workflows/` | 数据库写入 | 规则 |
| 执行器 | `executor.ts` | 意图分发 + 同清单串行化 | 规则 |
| Chat Pipeline | `chat-pipeline/` | 6 步管道编排 | 规则 + LLM |
| 计划拆解 | `workflows/plan-decomposer.ts` | LLM 拆解阶段 | LLM |
| 排期推理 | `workflows/schedule-time-llm.ts` | LLM 时间表达式理解 | LLM |
| 周报语义 | `workflows/weekly-review-llm.ts` | LLM 洞察增强 | LLM |
| Function Calling | `function-tools.ts` | 13 工具 OpenAI tool 格式 | LLM 原生 |
| 记忆系统 | `memory.ts`、`memory-vector.ts` | 向量检索 + 类型分类 | 规则 + Embeddings |
| Agent 审计 | `audit.ts` | 操作记录 | 规则 |
| 工作台 UI | `components/dashboard/agent/` | 对话/审批/追踪/产物面板 | React |
| Plan 模型 | `collections/Plan.ts` | 计划数据结构 | 数据 |

---

## 4. 目标架构

### 4.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                       Orchestrator Agent (LLM)                    │
│                                                                   │
│  输入: 用户消息 + 上下文 + 记忆                                    │
│  输出: 子任务 DAG { tasks, dependencies, priorities }              │
│  职责: 意图拆解 / 任务路由 / 结果合成 / 动态重规划                    │
└──────┬──────┬──────┬──────┬──────┬──────┘
       │      │      │      │      │
       ▼      ▼      ▼      ▼      ▼
┌──────┐ ┌────┐ ┌────┐ ┌──────┐ ┌────────┐
│ Plan │ │Sch │ │Rev │ │ Mem  │ │Content │  ...
│Agent │ │Agt │ │Agt │ │ Agt  │ │ Agent  │
└──┬───┘ └─┬──┘ └─┬──┘ └──┬───┘ └───┬────┘
   │       │      │       │         │
   ▼       ▼      ▼       ▼         ▼
┌─────────────────────────────────────────────────┐
│              Tool Registry (dryRun / execute)     │
│              Shared Context & Memory              │
│              Audit & Rollback Layer               │
└─────────────────────────────────────────────────┘
```

### 4.2 核心概念

#### Orchestrator Agent（编排器）

编排器是整个系统的调度中枢，独立 LLM 调用。职责：

1. **意图拆解**：「帮我制定考研计划，排进下周日程，设置每周复盘」→ 3 个子任务
2. **依赖推断**：创建计划 → 排期（依赖创建结果）→ 设置复盘（可并行）
3. **路由选择**：每个子任务匹配最合适的专业 Agent
4. **结果合成**：汇总子任务执行结果，生成统一响应

```typescript
// 编排器输入/输出概念
interface OrchestratorInput {
  message: string;
  history: Message[];
  context: WorkspaceSnapshot;
  memory: RelevantMemory[];
}

interface OrchestratorOutput {
  plan: TaskNode[];       // 子任务 DAG
  reasoning: string;      // 拆解理由
  mode: 'single' | 'compound';  // 单意图 / 复合意图
}
```

#### Specialized Agents（专业 Agent）

每个专业 Agent 是一个独立的 prompt + tool-set 组合：

| Agent | 领域 | 核心能力 | Tool 集 | LLM 驱动 |
|-------|------|---------|---------|---------|
| **PlanAgent** | 计划管理 | 创建/拆解/评估/调整 | createPlan, decomposePlan, evaluatePlan, adjustPlan | 拆解+评估 |
| **ScheduleAgent** | 日程排期 | 智能排期/冲突解析/精力分配 | schedulePlan, rescheduleItem, detectConflict | 排期推理 |
| **ReviewAgent** | 周报复盘 | 语义分析/洞察生成/建议 | generateReview, analyzeProgress, suggestAction | 全链路 |
| **MemoryAgent** | 记忆系统 | 偏好学习/上下文检索/知识图谱 | remember, recall, forget, relate | 存储决策 |
| **ContentAgent** | 内容运营 | 摘要/关联/发布建议 | summarize, linkContent, suggestPublish | 生成阶段 |
| **QueryAgent** | 进度查询 | 跨文档查询/复杂分析 | queryProgress, crossCheck, generateReport | 查询理解 |

#### Execution Graph（执行图）

任务以 DAG 形式组织，拓扑排序后并行执行无依赖节点：

```
  创建计划 ──→ 排期 ──→ 设置复盘
                │
  查询进度 ────┘ (可并行)
```

- 每个节点走 dryRun → confirm → execute 流程
- 失败节点触发动态重规划（Orchestrator 重新调度）
- 低风险操作可批量确认，减少用户交互成本

#### Shared Context & Memory（共享上下文）

```typescript
// 短期记忆：当前会话
interface WorkingMemory {
  sessionId: string;
  activePlanId?: string;
  pendingConfirmations: PendingAction[];
  recentActions: ActionTrace[];
}

// 长期记忆：用户画像
interface LongTermMemory {
  preferences: UserPreference[];      // 偏好设置
  behaviorPatterns: BehaviorPattern[]; // 行为模式
  knowledgeGraph: EntityRelation[];    // 实体关系
  learnedRules: UserRule[];           // 学到的规则
}
```

### 4.3 Function Calling 的使用时机

当前 `intent → switch → execute` 模式在单意图场景下等价于 function calling。

**Phase 3 以前不需要真正引入 function calling。** 提供者（Provider）原生支持后再迁移。

迁移路径：
```
当前:  LLM → JSON(intent, args) → 代码 switch → execute()
Phase3: LLM → tool_call(name, args) → 框架 dispatch → execute()
```

`tool-registry.ts` 中的函数定义可 1:1 映射为 function schema。

---

## 5. 实施路线图

> **Phase 1/2/3 均已完成。** 下一阶段的演进方向见 **[AGENT-MULTI-V2-GUIDE.md](AGENT-MULTI-V2-GUIDE.md)**，核心目标是让 Agent 具备自主 LLM 推理能力。

### Phase 1: LLM 化现有流程 ✅ 已完成

**目标**：将规则驱动的关键环节替换为 LLM 驱动，不改变架构骨架。

| 事项 | 文件 | 状态 |
|------|------|------|
| **统一意图解析** | `intent/llm-unified.ts` | LLM 优先 + 13 关键词候选集兜底 |
| **LLM 智能排期** | `workflows/schedule-time-llm.ts` | LLM 时间表达推理 |
| **LLM 周报生成** | `workflows/weekly-review-llm.ts` | 统计保留，洞察/建议 LLM 生成 |
| **排期冲突 LLM 解析** | `workflows/schedule-composer.ts` | LLM + 规则双路径 |

### Phase 2: 引入编排器 ✅ 已完成

**目标**：实现复合意图拆解，支持一个消息驱动多个任务。

| 事项 | 文件 | 状态 |
|------|------|------|
| **编排器** | `orchestration/orchestrator.ts` | 复合意图 → 子任务 DAG |
| **任务图执行** | `orchestration/execution-graph.ts` | DAG 拓扑分层并行 |
| **复合编排 Prompt** | `prompts/orchestrator.ts` | 编排器 system/user prompt |
| **Batch Confirm** | `schemas.ts` + pipeline | `await_batch_confirmation` 批量确认 |
| **Pipeline 改造** | `chat-pipeline/orchestration-step.ts` | 编排器前置 |

### Phase 3: 多 Agent 专业化 ✅ 骨架完成

**目标**：将工具按领域分组为独立 Agent，实现多 Agent 协作骨架。

| 事项 | 文件 | 状态 |
|------|------|------|
| **Agent 定义** | `agents/registry.ts` | 6 Agent 定义完成，`enrichIntent` 待实现 |
| **Agent 路由** | `agents/router.ts` | 编排器输出 → Agent 选择 |
| **共享上下文层** | `shared-context.ts` | 短期/长期记忆管理 |
| **Agent 间通信** | `agents/bus.ts` | 消息传递 + artifact 注入 |
| **向量记忆** | `memory-vector.ts` | 已实现（不依赖 pgvector） |

---

## 6. 核心模块预期结构（Phase 3 结束时）

```
src/lib/agent/
├── orchestrator.ts           # 编排器：拆解 + 路由
├── schemas.ts                # AgentIntent 类型（复用，扩展复合意图）
├── tool-registry.ts          # 工具注册（保持 dryRun/execute/rollback）
├── tools.ts                  # 工具实现（按领域拆分）
├── executor.ts               # 执行器（支持并行图执行）
├── execution-graph.ts        # DAG 执行引擎
├── shared-context.ts         # 共享上下文 & 记忆
├── audit.ts                  # AgentRun 审计
├── client.ts                 # LLM 客户端
├── prompts/
│   ├── orchestrator.ts       # 编排 prompt
│   ├── plan.ts               # 计划 agent prompt
│   ├── schedule.ts           # 排期 agent prompt
│   ├── review.ts             # 回顾 agent prompt
│   └── memory.ts             # 记忆 agent prompt
├── agents/
│   ├── plan-agent.ts
│   ├── schedule-agent.ts
│   ├── review-agent.ts
│   ├── memory-agent.ts
│   ├── content-agent.ts
│   └── query-agent.ts
├── workflows/
│   ├── plan-composer.ts      # 计划提案（保留，增强 LLM）
│   ├── plan-decomposer.ts    # 计划拆解（保留，归入 PlanAgent）
│   ├── plan-schedule-link.ts # 排期联动（LLM 化）
│   ├── schedule-composer.ts  # 日程编排（LLM 化）
│   ├── timeline-composer.ts  # 时间线编排
│   └── weekly-review.ts      # 周报（LLM 化）
├── chat-pipeline/            # 管道步骤（改造为图执行）
│   ├── run-agent-chat-pipeline.ts
│   ├── build-context-step.ts
│   ├── resolve-intent-step.ts → 替换为 orchestrator.ts
│   ├── dry-run-and-propose-step.ts
│   └── execute-and-persist-step.ts
└── intent/
    ├── intent.ts
    └── heuristics/           # 降级关键词（保留，离线兜底）
```

---

## 7. 数据库与模型演进

### 现有模型（保留）

- **Plan** — `agentState`, `agentBrief`, `phases`, `executionMode` 已为 Agent 编排设计
- **AgentThread** — 对话上下文
- **AgentRun** — 操作审计
- **AgentSuggestion** — 系统建议
- **AgentMemory** — 长期记忆
- **ScheduleItem** — 日程项
- **TimelineEvent** — 时间线
- **PlanReview** — 计划回顾

### 可能新增字段

```typescript
// Plan 扩展
Plan.fields.agentContext: JSON   // Agent 专属上下文（依赖图、中间结果）
Plan.fields.subtasks: JSON       // 编排器拆解的子任务状态

// AgentRun 扩展
AgentRun.fields.orchestrationId: string  // 编排批次的关联 ID
AgentRun.fields.agentRole: string        // 执行该操作的 Agent 角色
```

**原则**：不加新集合，扩展现有字段即可。

---

## 8. Vibe Coding 开发约定

### 编码规范

1. **类型安全第一**：所有 Agent 输入/输出必须有 TypeScript schema，任何 LLM 返回先校验后使用
2. **降级必须保留**：LLM 驱动的功能必须有规则兜底路径（离线、超时、模型不可用时）
3. **dry-run 不可跳过**：所有写操作必须走 dryRun → confirm → execute，不加新捷径
4. **无注释代码**：用清晰的命名表达意图，只在非显而易见的约束/降级逻辑处写一行注释
5. **不添加抽象**：3 个类似的代码块优于一次过早的抽象
6. **不写文档**：除了本文档，不为 Agent 写额外 *.md（prompt 除外）
7. **审计可回溯**：每个写操作创建 AgentRun，结构化记录 before/after

### 开发节奏

- **小步迭代**：每个 PR 只改一个环节（意图解析、排期、周报……）
- **先 LLM 化逻辑，后改架构**：Phase 1 不改骨架只换大脑，Phase 2-3 改骨架
- **测试随代码**：每新增 LLM 路径，同时加 eval case

### Prompt 编写规范

1. System prompt 放在 `src/lib/agent/prompts/*.ts`，不内联在逻辑中
2. Prompt 用模板字符串，参数明确类型化
3. 每次 LLM 调用指定 `response_format` 或 schema 校验
4. Temperature 规则：意图分类 = 0.1，生成性任务 = 0.4-0.6，创意任务 = 0.7-0.8

### 当前分支约定

- 工作分支：`codex/dashboard-ui-workbench`
- 主分支：`main`
- 提交风格：`feat(agent): <描述>` 或 `refactor(agent): <描述>`
- 别忘记 Co-Authored-By

---

## 9. 关键设计决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| Phase 1-2 不用 Function Calling | 沿用 intent JSON 模式 | 当前场景等价，无 Provider 迁移成本 |
| 编排器用独立 LLM 调用 | 是 | 复杂度需要独立推理，不能复用意图解析 prompt |
| 降级路径保留关键词 | 是 | 离线 / 超时 / 费用控制 |
| 批量确认 vs 逐条确认 | Phase 2 支持批量 | 低风险批量通过，高风险仍逐条 |
| 不新增 Payload 集合 | 扩展现有字段 | Schema 膨胀控制 |
| 不用 workflow engine (Temporal 等) | 图执行自研 | 依赖简单，引入引擎过重 |

---

## 10. 实施状态（已完成）

| 阶段 | 状态 | 关键交付 |
|------|------|---------|
| **Phase 1** | 已完成 | `intent/llm-unified.ts` 统一意图；`plan-schedule-llm.ts` 智能排期；`weekly-review-llm.ts` 周报洞察；`schedule-composer` 的 `composeScheduleProposalAsync`（LLM 时间 + 规则兜底） |
| **Phase 2** | 已完成 | `orchestrator.ts` / `execution-graph.ts`；`orchestration-step` 前置；`await_batch_confirmation` 批量确认；`orchestration/replan.ts` 失败重规划 |
| **Phase 3** | 已完成 | `agents/*` 专责 Agent + `bus.ts`；`shared-context.ts` 工作记忆；`build-context-step` 注入共享上下文；执行图经 `runSpecializedAgentForTask` 路由 |
| **数据模型** | 已完成 | `Plan.agentContext` / `subtasks`；`AgentRun.orchestrationId` / `agentRole` |

**进阶能力（已完成）**：

| 能力 | 实现 |
|------|------|
| 工具按领域拆分 | `src/lib/agent/tools/*` + `tool-shared.ts` + `checklist-resolvers.ts` |
| 并行图执行 | `orchestration/parallel-layers.ts`、`executeAgentIntentsParallel` |
| 向量记忆 | `memory-embeddings.ts`、`memory-vector.ts`、`AgentMemory.embedding` |
| Function Calling | `function-tools.ts` + `client.ts`（OpenAI / openai-compatible） |
| Agent 单测 | `tsx` 直跑 + `tsconfig.agent-test.json`（Payload stub） |
