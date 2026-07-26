/**
 * The Full Orchestrator and Residual Planner render the same ordered
 * intent-family rule body from this module. Canonical consultation,
 * explicit-goal, dependency, and live-gate exports are Full-only semantic
 * boundaries and are not rendered by the Residual Planner.
 */

import type {
  OrchestratorDecisionCode,
  OrchestratorOutput,
} from "../llm/schemas/orchestrator-output";
import type {
  RouterIntentName,
} from "../llm/schemas/router-output";

export const ORCHESTRATOR_CANONICAL_CONSULTATION_INTENT =
  "answer_question" as const;

type OrchestratorDependencyPair = readonly [
  producer: string,
  consumer: string,
];

const dependencyPair = (
  producer: string,
  consumer: string,
): OrchestratorDependencyPair =>
  Object.freeze([producer, consumer] as const);

export const ORCHESTRATOR_SUPPORTED_NEW_RESOURCE_DEPENDENCIES =
  Object.freeze([
    dependencyPair("compose_plan", "compose_checklist"),
    dependencyPair("query_progress", "compose_checklist"),
  ]);

export const ORCHESTRATOR_UNSUPPORTED_RUNTIME_OUTPUT_DEPENDENCIES =
  Object.freeze([
    dependencyPair("compose_plan", "schedule_plan"),
  ]);

export const ORCHESTRATOR_EXPLICIT_GOAL_CLASSIFICATION_STEP =
  "只把用户明确要求的结果拆成任务；不得添加用户未要求的辅助读取、准备、验证或上下文加载任务。";

const renderDependencies = (
  dependencies: readonly OrchestratorDependencyPair[],
): string => dependencies
  .map(([producer, consumer]) => `${producer} -> ${consumer}`)
  .join("、");

const ORCHESTRATOR_NEW_RESOURCE_DEPENDENCY_RULES = Object.freeze([
  "- 创建新资源并让后续任务依赖前置任务时，只有后续任务不需要前置 task 的运行时输出，才属于可用的新资源依赖。",
  `- ${renderDependencies(ORCHESTRATOR_SUPPORTED_NEW_RESOURCE_DEPENDENCIES)} 可用；二者只需要确定性顺序和独立可审阅草案。`,
  `- ${renderDependencies(ORCHESTRATOR_UNSUPPORTED_RUNTIME_OUTPUT_DEPENDENCIES)} 不支持，因为 schedule_plan 在执行前需要可信 existing planId；缺少该 planId 时必须选择 compound_missing_target 并只输出非空 question 的 clarify。`,
]);

export const ORCHESTRATOR_NEW_RESOURCE_DEPENDENCY_PROTOCOL =
  ORCHESTRATOR_NEW_RESOURCE_DEPENDENCY_RULES.join("\n");

export const ORCHESTRATOR_LIVE_GATE_RULES = Object.freeze({
  canonicalConsultation:
    `- pure_consultation 只能输出一个 ${ORCHESTRATOR_CANONICAL_CONSULTATION_INTENT} task；args.question 必须是当前用户请求的非空副本。`,
  explicitGoals:
    "- task 数量只来自用户明确要求的结果；一个明确目标必须是 single，两个或以上明确目标才可能是 compound。",
  queryScopeProvenance:
    "- query_plan_progress 只接受用户显式 positive planId，或由用户完整标题精确且唯一解析的计划；workspace context 只有一个计划不代表用户选择，禁止模糊、部分标题或 Provider 自选 context ID。",
  runtimeOutputDependencies:
    `- 当前支持无需运行时资源输出的依赖：${renderDependencies(ORCHESTRATOR_SUPPORTED_NEW_RESOURCE_DEPENDENCIES)}；当前不支持需要前置 task 运行结果的依赖：${renderDependencies(ORCHESTRATOR_UNSUPPORTED_RUNTIME_OUTPUT_DEPENDENCIES)}。`,
});

export const ORCHESTRATOR_LIVE_GATE_PROTOCOL = [
  "[orchestrator-boundary:live-gate]",
  ORCHESTRATOR_LIVE_GATE_RULES.canonicalConsultation,
  ORCHESTRATOR_LIVE_GATE_RULES.explicitGoals,
  ORCHESTRATOR_LIVE_GATE_RULES.queryScopeProvenance,
  ORCHESTRATOR_LIVE_GATE_RULES.runtimeOutputDependencies,
].join("\n");

export const ORCHESTRATOR_PLAN_SCHEDULE_REFERENCE_MARKER =
  "[orchestrator-boundary:plan-schedule-reference]" as const;

export type OrchestratorPlanScheduleReferenceCase = Readonly<{
  admitted: Readonly<{
    decisionCode: OrchestratorDecisionCode;
    intents: readonly RouterIntentName[];
    mode: OrchestratorOutput["mode"];
  }>;
  condition: string;
  forbiddenDecisionCodes: readonly OrchestratorDecisionCode[];
  forbiddenIntents: readonly RouterIntentName[];
  id:
    | "trusted_existing_plan_id"
    | "untrusted_existing_plan_reference"
    | "new_plan_schedule_dependency";
  reason: string;
}>;

const planScheduleReferenceCase = (
  input: OrchestratorPlanScheduleReferenceCase,
): OrchestratorPlanScheduleReferenceCase => Object.freeze({
  ...input,
  admitted: Object.freeze({
    ...input.admitted,
    intents: Object.freeze([...input.admitted.intents]),
  }),
  forbiddenDecisionCodes: Object.freeze([
    ...input.forbiddenDecisionCodes,
  ]),
  forbiddenIntents: Object.freeze([...input.forbiddenIntents]),
});

export const ORCHESTRATOR_PLAN_SCHEDULE_REFERENCE_CASES = Object.freeze([
  planScheduleReferenceCase({
    admitted: {
      decisionCode: "explicit_write_ready",
      intents: ["schedule_plan"],
      mode: "single",
    },
    condition:
      "one existing-plan scheduling goal; the user supplies a positive planId; "
      + "the actor-authorized workspace context contains the same planId; "
      + "any supplied full title exactly matches that plan",
    forbiddenDecisionCodes: [
      "compound_missing_target",
      "explicit_write_missing_resource",
    ],
    forbiddenIntents: ["clarify"],
    id: "trusted_existing_plan_id",
    reason:
      "这是对已存在计划的一次排期写入候选，不是新建计划，也不是复合任务。"
      + "必须原样复制可信 planId；不得因为时间细节仍可在后续草案中收口而提前澄清。",
  }),
  planScheduleReferenceCase({
    admitted: {
      decisionCode: "explicit_write_missing_resource",
      intents: ["clarify"],
      mode: "single",
    },
    condition:
      "one existing-plan scheduling goal; the plan reference is missing, "
      + "placeholder, outside the actor-authorized workspace context, "
      + "or has a title conflict",
    forbiddenDecisionCodes: [
      "compound_missing_target",
      "explicit_write_ready",
    ],
    forbiddenIntents: ["schedule_plan"],
    id: "untrusted_existing_plan_reference",
    reason:
      "用户请求只有一个已有计划排期目标，因此不能标记为 compound。"
      + "引用不可信时必须澄清，不能选择或编造 workspace 资源。",
  }),
  planScheduleReferenceCase({
    admitted: {
      decisionCode: "compound_missing_target",
      intents: ["clarify"],
      mode: "single",
    },
    condition:
      "the user explicitly requests creating a new plan and scheduling that "
      + "new plan, whose planId would only exist as runtime output",
    forbiddenDecisionCodes: [
      "compound_ready",
      "explicit_write_ready",
    ],
    forbiddenIntents: ["schedule_plan"],
    id: "new_plan_schedule_dependency",
    reason:
      "新计划的 planId 在当前调用中不存在，且禁止把前置任务运行时产出写入 args。"
      + "该不支持的复合依赖必须整体澄清。",
  }),
]);

const renderPlanScheduleReferenceCase = (
  contractCase: OrchestratorPlanScheduleReferenceCase,
): string => {
  const forbiddenDecisionCodes =
    contractCase.forbiddenDecisionCodes.join(",");
  const forbiddenIntents = contractCase.forbiddenIntents.join(",");
  return `- [${contractCase.id}] condition=${contractCase.condition}.`
    + ` 唯一允许的完整输出：decisionCode=${contractCase.admitted.decisionCode};`
    + ` mode=${contractCase.admitted.mode};`
    + ` intents=${contractCase.admitted.intents.join(",")}.`
    + ` 禁止 decisionCode=${forbiddenDecisionCodes};`
    + ` 禁止 intents=${forbiddenIntents}. ${contractCase.reason}`;
};

export const ORCHESTRATOR_PLAN_SCHEDULE_REFERENCE_PROTOCOL = [
  ORCHESTRATOR_PLAN_SCHEDULE_REFERENCE_MARKER,
  "- 以下三种排期引用条件互斥；先匹配引用条件，再选择唯一允许的 decision tuple。",
  ...ORCHESTRATOR_PLAN_SCHEDULE_REFERENCE_CASES.map(
    renderPlanScheduleReferenceCase,
  ),
].join("\n");

export const ORCHESTRATOR_SEMANTIC_CONTRAST_MARKER =
  "[orchestrator-boundary:semantic-contrasts]" as const;

export const ORCHESTRATOR_SEMANTIC_CONTRAST_MATCH_POLICY =
  "exclusive_tuple" as const;

export type OrchestratorSemanticContrast = Readonly<{
  admitted: Readonly<{
    decisionCode: OrchestratorDecisionCode;
    intents: readonly RouterIntentName[];
    mode: OrchestratorOutput["mode"];
  }>;
  forbiddenDecisionCodes: readonly OrchestratorDecisionCode[];
  forbiddenIntents: readonly RouterIntentName[];
  id:
    | "plan_inventory_query"
    | "single_plan_draft"
    | "natural_language_checklist_draft"
    | "partial_title_query"
    | "imperative_completion_mutation"
    | "unfinished_items_schedule"
    | "new_plan_schedule";
  reason: string;
  requestPattern: string;
}>;

const semanticContrast = (
  input: OrchestratorSemanticContrast,
): OrchestratorSemanticContrast => Object.freeze({
  ...input,
  admitted: Object.freeze({
    ...input.admitted,
    intents: Object.freeze([...input.admitted.intents]),
  }),
  forbiddenDecisionCodes: Object.freeze([
    ...input.forbiddenDecisionCodes,
  ]),
  forbiddenIntents: Object.freeze([...input.forbiddenIntents]),
});

export const ORCHESTRATOR_SEMANTIC_CONTRASTS = Object.freeze([
  semanticContrast({
    admitted: {
      decisionCode: "pure_read_query",
      intents: ["query_plan"],
      mode: "single",
    },
    forbiddenDecisionCodes: [],
    forbiddenIntents: ["query_progress", "query_plan_progress"],
    id: "plan_inventory_query",
    reason:
      "列出计划回答资源清单，不计算总体完成度，也不缩窄到某个具体计划。",
    requestPattern:
      "中性示例：用户只询问当前有哪些工作计划，没有询问进度或完成度。",
  }),
  semanticContrast({
    admitted: {
      decisionCode: "explicit_write_ready",
      intents: ["compose_plan"],
      mode: "single",
    },
    forbiddenDecisionCodes: ["compound_ready"],
    forbiddenIntents: ["compose_checklist"],
    id: "single_plan_draft",
    reason:
      "计划内部可以包含步骤，但这不等于用户明确要求第二个清单交付物；不得自行扩展目标。",
    requestPattern:
      "中性示例：用户只要求起草一份课程计划，没有要求任务清单。",
  }),
  semanticContrast({
    admitted: {
      decisionCode: "explicit_write_ready",
      intents: ["compose_checklist"],
      mode: "single",
    },
    forbiddenDecisionCodes: ["explicit_write_missing_resource"],
    forbiddenIntents: ["clarify", "create_checklist"],
    id: "natural_language_checklist_draft",
    reason:
      "自然语言清单请求是可审阅草案；缺少条目、分组或日期不是阻塞信息。",
    requestPattern:
      "中性示例：用户要求创建一份本周家务任务清单，但未给出完整结构化条目。",
  }),
  semanticContrast({
    admitted: {
      decisionCode: "unsupported_request",
      intents: ["clarify"],
      mode: "single",
    },
    forbiddenDecisionCodes: ["pure_read_query"],
    forbiddenIntents: ["query_plan_progress"],
    id: "partial_title_query",
    reason:
      "相似、部分、模糊或由 context 唯一性推断的标题没有可信 scope provenance。",
    requestPattern:
      "中性示例：workspace 中是‘高级课程复习计划’，用户只说‘课程计划进度’。",
  }),
  semanticContrast({
    admitted: {
      decisionCode: "explicit_write_missing_resource",
      intents: ["clarify"],
      mode: "single",
    },
    forbiddenDecisionCodes: [
      "pure_consultation",
      "pure_read_query",
      "explicit_write_ready",
    ],
    forbiddenIntents: [
      "answer_question",
      "query_plan_progress",
      "complete_plan_item",
    ],
    id: "imperative_completion_mutation",
    reason:
      "祈使完成或标记完成是 mutation；complete_plan_item 只能操作已有清单项。计划标题不能替代清单标题，workspace 中存在计划也不证明清单存在；没有 actor-authorized context 中精确且唯一的 checklistTitle 时，必须选择 explicit_write_missing_resource 并澄清。",
    requestPattern:
      "中性示例：workspace 只有一份课程计划，没有匹配清单；用户命令完成该计划中的一个条目。",
  }),
  semanticContrast({
    admitted: {
      decisionCode: "compound_missing_target",
      intents: ["clarify"],
      mode: "single",
    },
    forbiddenDecisionCodes: [
      "compound_ready",
      "explicit_write_ready",
    ],
    forbiddenIntents: [
      "query_progress",
      "compose_checklist",
      "compose_schedule_item",
      "create_schedule_items",
    ],
    id: "unfinished_items_schedule",
    reason:
      "把已有未完成条目移动到后续周期是 existing-target mutation；缺少可信且唯一的原计划、清单条目或日程引用时必须整体澄清，不能重写成新建清单或日程草案。",
    requestPattern:
      "中性示例：用户先查看本周期完成情况，再要求把尚未完成的既有条目移动到未来周期，但没有可信且唯一的原资源引用。",
  }),
  semanticContrast({
    admitted: {
      decisionCode: "compound_missing_target",
      intents: ["clarify"],
      mode: "single",
    },
    forbiddenDecisionCodes: ["compound_ready"],
    forbiddenIntents: ["schedule_plan"],
    id: "new_plan_schedule",
    reason:
      "新计划尚无可信 existing planId，当前合同不能把运行时产出传给 schedule_plan。",
    requestPattern:
      "中性示例：用户要求新建一份课程计划并立刻排入下周。",
  }),
]);

const renderContrast = (
  contrast: OrchestratorSemanticContrast,
): string => {
  const forbiddenDecisionCodes =
    contrast.forbiddenDecisionCodes.length === 0
      ? "无"
      : contrast.forbiddenDecisionCodes.join(",");
  const forbiddenIntents = contrast.forbiddenIntents.length === 0
    ? "无"
    : contrast.forbiddenIntents.join(",");

  return `- [${contrast.id}] ${contrast.requestPattern}`
    + ` 唯一允许的完整输出：decisionCode=${contrast.admitted.decisionCode};`
    + ` mode=${contrast.admitted.mode};`
    + ` intents=${contrast.admitted.intents.join(",")}.`
    + ` 已知错误示例：禁止 decisionCode=${forbiddenDecisionCodes};`
    + ` 禁止 intents=${forbiddenIntents}. ${contrast.reason}`;
};

export const ORCHESTRATOR_SEMANTIC_CONTRAST_PROTOCOL = [
  ORCHESTRATOR_SEMANTIC_CONTRAST_MARKER,
  `- matchPolicy=${ORCHESTRATOR_SEMANTIC_CONTRAST_MATCH_POLICY}；当一个 case 条件匹配时，admitted decisionCode、mode 与有序 intents 是唯一允许的完整输出；所有其他 decisionCode、mode、intent 序列、task 数量或 task shape 均禁止。`,
  ...ORCHESTRATOR_SEMANTIC_CONTRASTS.map(renderContrast),
].join("\n");

export const ORCHESTRATOR_QUERY_SCOPE_PRECEDENCE_MARKER =
  "[orchestrator-boundary:query-scope-precedence]" as const;

export type OrchestratorQueryScopePrecedenceCase = Readonly<{
  admitted: Readonly<{
    decisionCode: OrchestratorDecisionCode;
    intents: readonly RouterIntentName[];
    mode: OrchestratorOutput["mode"];
  }>;
  condition: string;
  example: string;
  forbiddenIntents: readonly RouterIntentName[];
  id:
    | "generic_progress_query"
    | "trusted_specific_plan_query"
    | "untrusted_specific_plan_attempt";
  reason: string;
}>;

const queryScopePrecedenceCase = (
  input: OrchestratorQueryScopePrecedenceCase,
): OrchestratorQueryScopePrecedenceCase => Object.freeze({
  ...input,
  admitted: Object.freeze({
    ...input.admitted,
    intents: Object.freeze([...input.admitted.intents]),
  }),
  forbiddenIntents: Object.freeze([...input.forbiddenIntents]),
});

export const ORCHESTRATOR_QUERY_SCOPE_PRECEDENCE_CASES = Object.freeze([
  queryScopePrecedenceCase({
    admitted: {
      decisionCode: "pure_read_query",
      intents: ["query_progress"],
      mode: "single",
    },
    condition:
      "用户只询问总体、全部或通用进度，且没有尝试点名任何具体计划。",
    example: "中性示例：查看全部学习项目的总体进度。",
    forbiddenIntents: ["query_plan_progress", "clarify"],
    id: "generic_progress_query",
    reason: "没有具体计划引用时保持 aggregate scope。",
  }),
  queryScopePrecedenceCase({
    admitted: {
      decisionCode: "pure_read_query",
      intents: ["query_plan_progress"],
      mode: "single",
    },
    condition:
      "用户显式给出 authorized context 中的 positive planId，或请求中的完整标题与 workspace 标题规范化后精确且唯一相等。",
    example:
      "中性示例：查看‘年度阅读复盘计划’的进度，且 workspace 标题完全相同。",
    forbiddenIntents: ["query_progress", "clarify"],
    id: "trusted_specific_plan_query",
    reason: "只有可信 provenance 才能缩窄到 specific plan scope。",
  }),
  queryScopePrecedenceCase({
    admitted: {
      decisionCode: "unsupported_request",
      intents: ["clarify"],
      mode: "single",
    },
    condition:
      "用户尝试点名具体计划，但引用是部分、模糊、缺失、冲突、歧义，或只由 context 唯一性推断。",
    example:
      "中性示例：workspace 是‘年度阅读复盘计划’，用户只说‘阅读计划进度’。",
    forbiddenIntents: ["query_progress", "query_plan_progress"],
    id: "untrusted_specific_plan_attempt",
    reason:
      "失败的 specific reference 必须澄清；不得扩大为 aggregate，也不得使用不可信 specific scope。",
  }),
]);

const renderQueryScopePrecedenceCase = (
  entry: OrchestratorQueryScopePrecedenceCase,
): string => `- [${entry.id}] 条件：${entry.condition}`
  + ` ${entry.example}`
  + ` 正确：decisionCode=${entry.admitted.decisionCode};`
  + ` mode=${entry.admitted.mode};`
  + ` intents=${entry.admitted.intents.join(",")}.`
  + ` 禁止 intents=${entry.forbiddenIntents.join(",")}.`
  + ` ${entry.reason}`;

export const ORCHESTRATOR_QUERY_SCOPE_PRECEDENCE_PROTOCOL = [
  ORCHESTRATOR_QUERY_SCOPE_PRECEDENCE_MARKER,
  "- 本节是 query scope 的最终优先级规则；当用户尝试点名具体计划时，本节覆盖此前的通用只读分类。必须先判断以下三种状态，再选择 intent。",
  ...ORCHESTRATOR_QUERY_SCOPE_PRECEDENCE_CASES.map(
    renderQueryScopePrecedenceCase,
  ),
].join("\n");

export const ORCHESTRATOR_INTENT_FAMILY_RULES = Object.freeze({
  draftComposition:
    "- compose_plan 与 compose_checklist 表示根据自然语言目标生成可审阅草案；请求需要生成内容或结构时选择 compose_ intent。",
  directPersistence:
    "- create_plan 与 create_checklist 只用于用户已经提供完整结构化数据、可直接形成持久化候选的情况；Orchestrator 本身仍不得执行持久化。",
  queryScope:
    "- query_plan 用于列出计划、查看有哪些计划或读取计划清单；query_progress 只用于全局或通用进度、完成度读取；query_plan_progress 只用于用户明确且唯一定位一个具体计划的进度读取。",
  taskDraftVsMemory:
    "- save_memory 只用于长期记忆、偏好、事实或工作流规则，不得用于记录新任务；把读取结果整理为新任务或清单草案时选择 compose_checklist。",
});

const ORDERED_INTENT_FAMILY_RULES = Object.freeze([
  ORCHESTRATOR_INTENT_FAMILY_RULES.draftComposition,
  ORCHESTRATOR_INTENT_FAMILY_RULES.directPersistence,
  ORCHESTRATOR_INTENT_FAMILY_RULES.queryScope,
  ORCHESTRATOR_INTENT_FAMILY_RULES.taskDraftVsMemory,
]);

const renderIntentFamilyProtocol = (header: string): string => [
  header,
  ...ORDERED_INTENT_FAMILY_RULES,
].join("\n");

export const ORCHESTRATOR_INTENT_FAMILY_PROTOCOL =
  renderIntentFamilyProtocol("[compound-boundary:intent-family]");

export const RESIDUAL_INTENT_FAMILY_PROTOCOL =
  renderIntentFamilyProtocol("[residual-boundary:intent-family]");
