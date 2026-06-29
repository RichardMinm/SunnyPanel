import type { ToolPlan } from "../plan/tool-plan";
import type { LLMRouterOutput } from "../router/llm-router-schema";

export type WorkflowKind = ToolPlan["workflow"];

export type WorkflowDispatchInput = {
  confirmed: boolean;
  router: LLMRouterOutput;
  toolPlan: ToolPlan;
};

export type WorkflowDispatchResult = {
  allowDryRun: boolean;
  allowExecute: boolean;
  assistantHint?: string;
  phase: "answer" | "clarify" | "confirm" | "dry_run" | "execute" | "search";
  workflow: WorkflowKind;
};

export const dispatchWorkflow = (input: WorkflowDispatchInput): WorkflowDispatchResult => {
  const { confirmed, router, toolPlan } = input;

  if (toolPlan.blockedReason) {
    return {
      allowDryRun: false,
      allowExecute: false,
      assistantHint: toolPlan.blockedReason,
      phase: "clarify",
      workflow: toolPlan.workflow,
    };
  }

  if (toolPlan.workflow === "capability" || toolPlan.workflow === "expand_answer") {
    return {
      allowDryRun: false,
      allowExecute: false,
      phase: "answer",
      workflow: toolPlan.workflow,
    };
  }

  if (toolPlan.workflow === "query") {
    return {
      allowDryRun: false,
      allowExecute: false,
      phase: "search",
      workflow: "query",
    };
  }

  if (confirmed && toolPlan.executeCapability) {
    return {
      allowDryRun: false,
      allowExecute: true,
      phase: "execute",
      workflow: toolPlan.workflow,
    };
  }

  return {
    allowDryRun: toolPlan.plannedCapabilities.some((name) => name.startsWith("preview_")),
    allowExecute: false,
    phase: router.requiresConfirmation || router.riskLevel === "high" ? "confirm" : "dry_run",
    workflow: toolPlan.workflow,
  };
};
