import { executeCapabilityForPreview } from "../capabilities/adapters";
import type { LLMRouterOutput } from "../router/llm-router-schema";
import type { TargetResolutionResult } from "../resolver/target-resolver";

export type ToolPlanWorkflow =
  | "capability"
  | "create"
  | "delete"
  | "expand_answer"
  | "query"
  | "update";

export type ToolPlanResolverStatus = "multiple" | "not_found" | "unique";

export type ToolPlan = {
  blockedReason?: string;
  executeCapability?: string;
  plannedCapabilities: string[];
  resolverStatus?: ToolPlanResolverStatus;
  workflow: ToolPlanWorkflow;
};

const previewForTarget = (action: LLMRouterOutput["action"], target: LLMRouterOutput["target"]): string[] => {
  if (action === "query") {
    if (target === "schedule") {
      return ["search_schedules"];
    }

    if (target === "checklist") {
      return ["search_checklists"];
    }

    if (target === "plan") {
      return ["search_plans"];
    }

    if (target === "memory") {
      return ["search_memory"];
    }

    if (target === "timeline") {
      return ["search_timeline"];
    }

    return ["search_plans", "search_schedules"];
  }

  if (action === "create") {
    if (target === "schedule") {
      return ["search_schedules", "preview_create_schedule"];
    }

    if (target === "timeline") {
      return ["search_timeline", "preview_create_timeline"];
    }

    if (target === "checklist") {
      return ["search_checklists", "draft_checklist"];
    }

    if (target === "writing") {
      return ["draft_writing_outline"];
    }

    if (target === "memory") {
      return ["search_memory"];
    }

    return ["search_plans", "draft_plan", "preview_create_plan"];
  }

  if (action === "update") {
    if (target === "schedule") {
      return ["search_schedules", "preview_update_schedule"];
    }

    if (target === "checklist") {
      return ["search_checklists", "preview_update_checklist"];
    }

    return ["search_plans", "preview_update_plan"];
  }

  if (action === "delete" || action === "cancel") {
    if (target === "schedule") {
      return ["search_schedules", "preview_delete_schedule"];
    }

    if (target === "checklist") {
      return ["search_checklists", "preview_delete_checklist"];
    }

    if (target === "timeline") {
      return ["search_timeline", "preview_delete_timeline"];
    }

    return ["search_plans", "preview_delete_plan"];
  }

  return [];
};

const workflowFromRouter = (router: LLMRouterOutput): ToolPlanWorkflow => {
  if (router.action === "capability") {
    return "capability";
  }

  if (router.action === "expand_answer" || router.action === "explain" || router.action === "summarize") {
    return "expand_answer";
  }

  if (router.action === "query") {
    return "query";
  }

  if (router.action === "delete" || router.action === "cancel") {
    return "delete";
  }

  if (router.action === "update") {
    return "update";
  }

  return "create";
};

const normalizeResolverStatus = (
  status?: TargetResolutionResult<unknown>["status"],
): ToolPlanResolverStatus | undefined => {
  if (!status) {
    return undefined;
  }

  return status === "ambiguous" ? "multiple" : status;
};

export const buildToolPlan = (input: {
  allowedCapabilities: string[];
  resolverResult?: TargetResolutionResult<unknown>;
  router: LLMRouterOutput;
}): ToolPlan => {
  const workflow = workflowFromRouter(input.router);
  const resolverStatus = normalizeResolverStatus(input.resolverResult?.status);

  if (workflow === "capability" || workflow === "expand_answer") {
    return {
      plannedCapabilities: [],
      workflow,
    };
  }

  if (workflow === "query") {
    const planned = previewForTarget("query", input.router.target).filter((name) =>
      input.allowedCapabilities.includes(name),
    );

    return {
      plannedCapabilities: planned,
      workflow,
    };
  }

  if (resolverStatus === "not_found") {
    return {
      blockedReason: input.resolverResult?.question ?? "未找到唯一目标，禁止 preview/execute。",
      plannedCapabilities: [],
      resolverStatus,
      workflow,
    };
  }

  if (resolverStatus === "multiple") {
    return {
      blockedReason: input.resolverResult?.question ?? "找到多个匹配目标，请先选择具体对象。",
      plannedCapabilities: [],
      resolverStatus,
      workflow,
    };
  }

  const candidates = previewForTarget(input.router.action, input.router.target);
  const plannedCapabilities = candidates.filter((name) => input.allowedCapabilities.includes(name));
  const previewCapability = plannedCapabilities.find((name) => name.startsWith("preview_"));
  const executeCapability = previewCapability ? executeCapabilityForPreview(previewCapability) ?? undefined : undefined;

  return {
    executeCapability: executeCapability ?? undefined,
    plannedCapabilities,
    resolverStatus,
    workflow,
  };
};
