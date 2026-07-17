/**
 * Shared natural-language boundaries for intents that are structurally valid
 * but semantically easy to confuse. Both the full Orchestrator and the
 * Residual Planner render these exact rules from one source.
 */

export const ORCHESTRATOR_INTENT_FAMILY_RULES = Object.freeze({
  draftComposition:
    "- compose_plan 与 compose_checklist 表示根据自然语言目标生成可审阅草案；请求需要生成内容或结构时选择 compose_ intent。",
  directPersistence:
    "- create_plan 与 create_checklist 只用于用户已经提供完整结构化数据、可直接形成持久化候选的情况；Orchestrator 本身仍不得执行持久化。",
  queryScope:
    "- query_progress 用于全局或通用进度读取；query_plan_progress 只用于用户明确且唯一定位一个具体计划的读取。",
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
