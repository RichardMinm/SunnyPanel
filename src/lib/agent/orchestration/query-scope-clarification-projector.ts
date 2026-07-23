import type { QueryScopeErrorCode } from "./query-scope-contract";
import type { OrchestratorPlan } from "./types";

const questionByCode = Object.freeze({
  aggregate_for_explicit_plan:
    "你提到了具体计划，但查询范围不明确。请确认要查看的计划 ID 或完整标题。",
  explicit_plan_id_not_found:
    "没有找到你提供的计划 ID。请确认计划 ID 或提供准确的计划标题。",
  id_title_conflict:
    "计划 ID 与标题指向不同目标。请确认要查看哪一个计划。",
  invalid_aggregate_args:
    "查询范围包含无法确认的条件。请说明要查看全部进度，还是某个具体计划。",
  provider_selected_workspace_resource:
    "你还没有明确选择具体计划。请提供计划 ID 或准确的完整标题。",
  specific_reference_required:
    "查询具体计划需要明确目标。请提供计划 ID 或准确的完整标题。",
  title_ambiguous:
    "找到多个同名计划。请提供计划 ID 以确认目标。",
  title_not_found:
    "没有找到该计划标题。请确认准确的完整标题或提供计划 ID。",
} satisfies Record<QueryScopeErrorCode, string>);

export const PROJECTABLE_QUERY_SCOPE_CLARIFICATION_CODES:
  ReadonlySet<QueryScopeErrorCode> = new Set(
    Object.keys(questionByCode) as QueryScopeErrorCode[],
  );

export type QueryScopeClarificationProjection = Readonly<{
  plan: OrchestratorPlan;
  queryScopeErrorCode: QueryScopeErrorCode;
}>;

export const projectQueryScopeErrorToClarification = (
  code: QueryScopeErrorCode,
): QueryScopeClarificationProjection | null => {
  if (!Object.hasOwn(questionByCode, code)) return null;

  const task = Object.freeze({
    agentRole: "query" as const,
    args: Object.freeze({ question: questionByCode[code] }),
    dependsOn: Object.freeze([]) as string[],
    id: "t1",
    intent: "clarify" as const,
    label: "确认查询范围",
  });
  const tasks = [task];
  Object.freeze(tasks);

  const plan: OrchestratorPlan = {
    mode: "single",
    reasoning: "确定性查询范围澄清：具体查询范围未通过来源校验。",
    source: "llm",
    tasks,
  };
  Object.freeze(plan);

  return Object.freeze({
    plan,
    queryScopeErrorCode: code,
  });
};
