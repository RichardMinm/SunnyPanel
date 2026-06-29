import type { AgentRouterAction } from "../router/types";
import type { TargetResolutionStatus } from "../resolver/target-resolver";
import type { AgentRouterOutput } from "../router/types";

export type PolicyGuardOutput = {
  allowDryRun: boolean;
  allowExecute: boolean;
  mustShowImpactPreview: boolean;
  reason: string;
  requiresConfirmation: boolean;
  riskLevel: "high" | "low" | "medium" | "none";
  writeRequired: boolean;
};

const readOnlyActions = new Set<AgentRouterAction>(["query", "answer", "expand", "capability", "clarify"]);

const writeActions = new Set<AgentRouterAction>(["create", "update", "delete"]);

export const applyPolicyGuard = (input: {
  resolverStatus?: TargetResolutionStatus;
  router: AgentRouterOutput;
}): PolicyGuardOutput => {
  const { action } = input.router;
  const resolverBlocked =
    input.resolverStatus !== undefined && input.resolverStatus !== "unique";

  if (readOnlyActions.has(action)) {
    return {
      allowDryRun: false,
      allowExecute: false,
      mustShowImpactPreview: false,
      reason: `${action} 为只读动作，禁止 dryRun 与 execute`,
      requiresConfirmation: false,
      riskLevel: "none",
      writeRequired: false,
    };
  }

  if (resolverBlocked) {
    return {
      allowDryRun: false,
      allowExecute: false,
      mustShowImpactPreview: false,
      reason: `目标解析状态 ${input.resolverStatus}，禁止 preview 与 execute`,
      requiresConfirmation: false,
      riskLevel: "none",
      writeRequired: false,
    };
  }

  if (action === "delete") {
    return {
      allowDryRun: true,
      allowExecute: true,
      mustShowImpactPreview: true,
      reason: "delete 动作需 impact preview + 确认后 execute",
      requiresConfirmation: true,
      riskLevel: "high",
      writeRequired: true,
    };
  }

  if (action === "create" || action === "update") {
    return {
      allowDryRun: true,
      allowExecute: true,
      mustShowImpactPreview: action === "update",
      reason: `${action} 动作允许 preview，execute 仅确认后`,
      requiresConfirmation: true,
      riskLevel: action === "update" ? "medium" : "medium",
      writeRequired: true,
    };
  }

  if (!writeActions.has(action)) {
    return {
      allowDryRun: false,
      allowExecute: false,
      mustShowImpactPreview: false,
      reason: "未知 action，默认只读",
      requiresConfirmation: false,
      riskLevel: "none",
      writeRequired: false,
    };
  }

  return {
    allowDryRun: false,
    allowExecute: false,
    mustShowImpactPreview: true,
    reason: "bulk/clear/publish 类危险动作需特殊确认",
    requiresConfirmation: true,
    riskLevel: "high",
    writeRequired: true,
  };
};
