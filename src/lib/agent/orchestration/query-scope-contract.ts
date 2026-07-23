import type { OrchestratorOutput } from "../llm/schemas/orchestrator-output";
import type { AgentPromptContext } from "../prompts";
import { normalizePlanTitle } from "../query/plan-title";
import {
  analyzePlanReferenceEvidence,
  isPositivePlanId,
} from "./plan-reference-evidence";
import type { OrchestratorPlan } from "./types";

export type QueryScopeProvenance =
  | {
      scope: "aggregate";
      source: "user_unspecified";
    }
  | {
      planId: number;
      scope: "plan";
      source: "explicit_plan_id";
    }
  | {
      planId: number;
      scope: "plan";
      source: "resolved_exact_title";
    };

export type QueryScopeErrorCode =
  | "aggregate_for_explicit_plan"
  | "explicit_plan_id_not_found"
  | "id_title_conflict"
  | "invalid_aggregate_args"
  | "provider_selected_workspace_resource"
  | "specific_reference_required"
  | "title_ambiguous"
  | "title_not_found";

export type QueryScopeValidationResult =
  | {
      output: OrchestratorOutput;
      provenances: ReadonlyArray<{
        provenance: QueryScopeProvenance;
        taskId: string;
      }>;
      valid: true;
    }
  | {
      code: QueryScopeErrorCode;
      safeMessage: string;
      valid: false;
    };

export type QueryScopePlanValidationResult =
  | {
      plan: OrchestratorPlan;
      provenances: ReadonlyArray<{
        provenance: QueryScopeProvenance;
        taskId: string;
      }>;
      valid: true;
    }
  | {
      code: QueryScopeErrorCode;
      safeMessage: string;
      valid: false;
    };

type QueryTask = {
  args: Record<string, unknown>;
  id: string;
  intent: string;
};

type ValidatedTasks<T extends QueryTask> =
  | {
      provenances: Array<{
        provenance: QueryScopeProvenance;
        taskId: string;
      }>;
      tasks: T[];
      valid: true;
    }
  | {
      code: QueryScopeErrorCode;
      safeMessage: string;
      valid: false;
    };

const invalid = (
  code: QueryScopeErrorCode,
  safeMessage: string,
): Extract<ValidatedTasks<QueryTask>, { valid: false }> => ({
  code,
  safeMessage,
  valid: false,
});

const hasOnlyKeys = (
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean => Object.keys(value).every((key) => allowed.includes(key));

const validateAggregateArgs = (
  args: Record<string, unknown>,
): Record<string, unknown> | null => {
  if (!hasOnlyKeys(args, ["checklistTitle", "scope"])) return null;
  if (args.checklistTitle !== undefined && args.checklistTitle !== null) return null;
  if (
    args.scope !== undefined
    && args.scope !== null
    && args.scope !== "all"
    && args.scope !== "plans"
    && args.scope !== "checklists"
  ) return null;

  return args.scope === undefined || args.scope === null
    ? {}
    : { scope: args.scope };
};

const resolveExactTitle = (params: {
  context: AgentPromptContext;
  message: string;
  planTitle: string;
}):
  | { planId: number; valid: true }
  | Extract<ValidatedTasks<QueryTask>, { valid: false }> => {
  const normalizedTitle = normalizePlanTitle(params.planTitle);
  const normalizedMessage = normalizePlanTitle(params.message);
  const matches = analyzePlanReferenceEvidence({
    context: params.context,
    message: params.message,
  }).trustedPlans.filter(
    (plan) => normalizePlanTitle(plan.title) === normalizedTitle,
  );

  if (matches.length === 0) {
    return invalid(
      "title_not_found",
      "没有唯一找到用户明确引用的计划，请确认具体计划。",
    );
  }
  if (matches.length > 1) {
    return invalid(
      "title_ambiguous",
      "找到多个同名计划，请提供计划 ID 以确认目标。",
    );
  }
  if (!normalizedMessage.includes(normalizedTitle)) {
    return invalid(
      "provider_selected_workspace_resource",
      "用户没有明确选择具体计划，不能从工作区上下文隐式缩窄查询范围。",
    );
  }

  return { planId: matches[0].id, valid: true };
};

const validatePlanTask = (params: {
  context: AgentPromptContext;
  message: string;
  task: QueryTask;
}):
  | {
      args: Record<string, unknown>;
      provenance: QueryScopeProvenance;
      valid: true;
    }
  | Extract<ValidatedTasks<QueryTask>, { valid: false }> => {
  const { args } = params.task;
  if (!hasOnlyKeys(args, ["planId", "planTitle"])) {
    return invalid(
      "specific_reference_required",
      "查询具体计划进度需要用户明确提供计划 ID 或完整标题。",
    );
  }

  const planId = args.planId;
  const planTitle = typeof args.planTitle === "string" && args.planTitle.trim()
    ? args.planTitle
    : null;
  const evidence = analyzePlanReferenceEvidence({
    context: params.context,
    message: params.message,
  });
  const explicitIds = evidence.explicitPlanIds;
  const contextPlans = evidence.trustedPlans;

  if (planId !== undefined && planId !== null && !isPositivePlanId(planId)) {
    return invalid(
      "specific_reference_required",
      "查询具体计划进度需要用户明确提供计划 ID 或完整标题。",
    );
  }

  if (isPositivePlanId(planId) && explicitIds.includes(planId)) {
    const selectedPlan = contextPlans.find((plan) => plan.id === planId);
    if (!selectedPlan) {
      return invalid(
        "explicit_plan_id_not_found",
        "没有找到用户明确引用的计划，请确认计划 ID。",
      );
    }
    if (planTitle) {
      const titleResult = resolveExactTitle({
        context: params.context,
        message: params.message,
        planTitle,
      });
      if (!titleResult.valid) return titleResult;
      if (titleResult.planId !== planId) {
        return invalid(
          "id_title_conflict",
          "计划 ID 与标题指向不同资源，请确认要查询的计划。",
        );
      }
    }

    return {
      args: { planId },
      provenance: { planId, scope: "plan", source: "explicit_plan_id" },
      valid: true,
    };
  }

  if (planTitle) {
    const titleResult = resolveExactTitle({
      context: params.context,
      message: params.message,
      planTitle,
    });
    if (!titleResult.valid) return titleResult;
    if (isPositivePlanId(planId) && titleResult.planId !== planId) {
      return invalid(
        "id_title_conflict",
        "计划 ID 与标题指向不同资源，请确认要查询的计划。",
      );
    }

    return {
      args: { planId: titleResult.planId },
      provenance: {
        planId: titleResult.planId,
        scope: "plan",
        source: "resolved_exact_title",
      },
      valid: true,
    };
  }

  if (isPositivePlanId(planId)) {
    const titleMatches = evidence.exactTitlePlans;
    if (titleMatches.length > 1) {
      return invalid(
        "title_ambiguous",
        "找到多个同名计划，请提供计划 ID 以确认目标。",
      );
    }
    if (titleMatches.length === 1) {
      if (titleMatches[0].id !== planId) {
        return invalid(
          "id_title_conflict",
          "计划 ID 与标题指向不同资源，请确认要查询的计划。",
        );
      }
      return {
        args: { planId },
        provenance: {
          planId,
          scope: "plan",
          source: "resolved_exact_title",
        },
        valid: true,
      };
    }

    return invalid(
      "provider_selected_workspace_resource",
      "用户没有明确选择具体计划，不能从工作区上下文隐式缩窄查询范围。",
    );
  }

  return invalid(
    "specific_reference_required",
    "查询具体计划进度需要用户明确提供计划 ID 或完整标题。",
  );
};

const validateTasks = <T extends QueryTask>(params: {
  context: AgentPromptContext;
  message: string;
  tasks: T[];
}): ValidatedTasks<T> => {
  const evidence = analyzePlanReferenceEvidence({
    context: params.context,
    message: params.message,
  });
  const explicitIds = evidence.explicitPlanIds;
  const selectedTitles = evidence.exactTitlePlans;
  const provenances: Array<{
    provenance: QueryScopeProvenance;
    taskId: string;
  }> = [];
  const tasks: T[] = [];

  for (const task of params.tasks) {
    if (task.intent === "query_progress") {
      const normalizedArgs = validateAggregateArgs(task.args);
      if (!normalizedArgs) {
        return invalid(
          "invalid_aggregate_args",
          "聚合进度查询包含不支持的范围参数，请重新确认查询范围。",
        );
      }
      if (explicitIds.length > 0 || selectedTitles.length > 0) {
        return invalid(
          "aggregate_for_explicit_plan",
          "用户明确引用了具体计划，不能将查询扩大为聚合范围。",
        );
      }
      provenances.push({
        provenance: { scope: "aggregate", source: "user_unspecified" },
        taskId: task.id,
      });
      tasks.push({ ...task, args: normalizedArgs });
      continue;
    }

    if (task.intent === "query_plan_progress") {
      const planResult = validatePlanTask({ ...params, task });
      if (!planResult.valid) return planResult;
      provenances.push({ provenance: planResult.provenance, taskId: task.id });
      tasks.push({ ...task, args: planResult.args });
      continue;
    }

    tasks.push(task);
  }

  return { provenances, tasks, valid: true };
};

export const validateAndNormalizeOrchestratorQueryScopes = (params: {
  context: AgentPromptContext;
  message: string;
  output: OrchestratorOutput;
}): QueryScopeValidationResult => {
  const result = validateTasks({
    context: params.context,
    message: params.message,
    tasks: params.output.tasks,
  });
  if (!result.valid) return result;
  return {
    output: { ...params.output, tasks: result.tasks },
    provenances: result.provenances,
    valid: true,
  };
};

export const validateAndNormalizeOrchestratorPlanQueryScopes = (params: {
  context: AgentPromptContext;
  message: string;
  plan: OrchestratorPlan;
}): QueryScopePlanValidationResult => {
  const result = validateTasks({
    context: params.context,
    message: params.message,
    tasks: params.plan.tasks,
  });
  if (!result.valid) return result;
  return {
    plan: { ...params.plan, tasks: result.tasks },
    provenances: result.provenances,
    valid: true,
  };
};
