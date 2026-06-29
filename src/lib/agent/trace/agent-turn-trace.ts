import type { PolicyGuardResult } from "../policy/tool-gate";
import type { PolicyGuardOutput } from "../policy/guard";
import type { ToolPlan } from "../plan/tool-plan";
import type { LLMRouterOutput } from "../router/llm-router-schema";
import type { AgentRouterOutput } from "../router/types";
import { capabilityForLegacyIntent, executeCapabilityForPreview } from "../capabilities/adapters";
import type { AgentWriteIntentName } from "../schemas";
import type { AgentDryRunResult, PendingAction } from "../schemas";
import type { TargetResolutionResult } from "../resolver/target-resolver";

export type AgentTurnTrace = {
  actualTools: string[];
  allowedCapabilities?: string[];
  blockedCapabilities?: Array<{ name: string; reason: string }>;
  confirmationState: "approved" | "auto_approved" | "none" | "pending" | "rejected";
  dryRunResult?: AgentDryRunResult["type"];
  llmRouterOutput?: LLMRouterOutput;
  plannedTools: string[];
  policyGuard?: PolicyGuardResult;
  policyGuardOutput?: PolicyGuardOutput;
  rawUserInput?: string;
  requiresConfirmation?: boolean;
  resolverResult?: Pick<TargetResolutionResult<unknown>, "status"> & { question?: null | string };
  riskLevel?: PolicyGuardOutput["riskLevel"];
  routerOutput?: AgentRouterOutput;
  toolPlan?: ToolPlan;
  turnId?: string;
  writeRequired?: boolean;
};

export type AgentTurnAuditStep = {
  detail?: string;
  id: string;
  kind: "action" | "analysis" | "complete" | "context" | "error" | "write";
  payload?: Partial<AgentTurnTrace>;
  status: "done" | "error" | "running";
  title: string;
};

export const createEmptyTurnTrace = (turnId?: string): AgentTurnTrace => ({
  actualTools: [],
  confirmationState: "none",
  plannedTools: [],
  turnId,
});

export const capabilityNameForIntent = (intent: AgentWriteIntentName, phase: "execute" | "preview" = "preview") =>
  capabilityForLegacyIntent(intent, phase) ?? intent;

export const recordRouterTrace = (
  trace: AgentTurnTrace,
  routerOutput: AgentRouterOutput,
  options?: { llmRouterOutput?: LLMRouterOutput; toolPlan?: ToolPlan },
): AgentTurnTrace => {
  const previewCapability = routerOutput.requiresWrite
    ? capabilityNameForIntent(routerOutput.intent.intent as AgentWriteIntentName, "preview")
    : null;
  const plannedFromToolPlan = options?.toolPlan?.plannedCapabilities ?? [];

  return {
    ...trace,
    llmRouterOutput: options?.llmRouterOutput,
    plannedTools: plannedFromToolPlan.length > 0 ? plannedFromToolPlan : previewCapability ? [previewCapability] : [],
    routerOutput,
    toolPlan: options?.toolPlan,
  };
};

export const recordToolPlanTrace = (trace: AgentTurnTrace, toolPlan: ToolPlan): AgentTurnTrace => ({
  ...trace,
  plannedTools: toolPlan.plannedCapabilities,
  toolPlan,
});

export const recordPolicyTrace = (
  trace: AgentTurnTrace,
  policyGuard: PolicyGuardResult,
): AgentTurnTrace => ({
  ...trace,
  allowedCapabilities: policyGuard.allowedCapabilities,
  blockedCapabilities: policyGuard.blockedCapabilities,
  plannedTools: policyGuard.plannedTools.length > 0 ? policyGuard.plannedTools : trace.plannedTools,
  policyGuard,
});

export const recordPolicyGuardOutputTrace = (
  trace: AgentTurnTrace,
  policyGuardOutput: PolicyGuardOutput,
): AgentTurnTrace => ({
  ...trace,
  policyGuardOutput,
  requiresConfirmation: policyGuardOutput.requiresConfirmation,
  riskLevel: policyGuardOutput.riskLevel,
  writeRequired: policyGuardOutput.writeRequired,
});

export const recordCapabilityGateTrace = (
  trace: AgentTurnTrace,
  gate: { allowed: string[]; blocked: Array<{ name: string; reason: string }> },
): AgentTurnTrace => ({
  ...trace,
  allowedCapabilities: gate.allowed,
  blockedCapabilities: gate.blocked,
});

export const recordRawUserInputTrace = (trace: AgentTurnTrace, rawUserInput: string): AgentTurnTrace => ({
  ...trace,
  rawUserInput,
});

export const recordResolverTrace = (
  trace: AgentTurnTrace,
  resolverResult: TargetResolutionResult<unknown>,
): AgentTurnTrace => ({
  ...trace,
  resolverResult: {
    question: resolverResult.question,
    status: resolverResult.status,
  },
});

export const recordDryRunTrace = (
  trace: AgentTurnTrace,
  dryRunResult: AgentDryRunResult,
): AgentTurnTrace => ({
  ...trace,
  dryRunResult: dryRunResult.type,
});

export const recordConfirmationTrace = (
  trace: AgentTurnTrace,
  state: AgentTurnTrace["confirmationState"],
): AgentTurnTrace => ({
  ...trace,
  confirmationState: state,
});

export const recordActualTool = (trace: AgentTurnTrace, toolName: string): AgentTurnTrace => ({
  ...trace,
  actualTools: trace.actualTools.includes(toolName)
    ? trace.actualTools
    : [...trace.actualTools, toolName],
});

export const assertPlannedVsActual = (trace: AgentTurnTrace): { ok: boolean; reason: string } => {
  if (trace.plannedTools.length === 0 && trace.actualTools.length === 0) {
    return { ok: true, reason: "只读回合，无工具计划" };
  }

  if (trace.plannedTools.length === 0 && trace.actualTools.length > 0) {
    return { ok: false, reason: `未计划工具但实际执行：${trace.actualTools.join(", ")}` };
  }

  const isAllowedActual = (planned: string, actual: string) => {
    if (planned === actual) {
      return true;
    }

    const mappedExecute = executeCapabilityForPreview(planned);

    return mappedExecute === actual;
  };

  const unexpected = trace.actualTools.filter(
    (tool) => !trace.plannedTools.some((planned) => isAllowedActual(planned, tool)),
  );

  if (unexpected.length > 0) {
    return { ok: false, reason: `实际工具超出计划：${unexpected.join(", ")}` };
  }

  return { ok: true, reason: "planned 与 actual 一致" };
};

export const traceStepFromAudit = (
  id: string,
  title: string,
  trace: Partial<AgentTurnTrace>,
  kind: AgentTurnAuditStep["kind"] = "analysis",
): AgentTurnAuditStep => ({
  detail: JSON.stringify(trace),
  id,
  kind,
  payload: trace,
  status: "done",
  title,
});

export const pendingActionToConfirmationState = (
  pending: null | PendingAction,
  executionApproved: boolean,
): AgentTurnTrace["confirmationState"] => {
  if (executionApproved) {
    return "approved";
  }

  if (!pending) {
    return "none";
  }

  if (pending.type === "await_confirmation" || pending.type === "await_batch_confirmation") {
    return "pending";
  }

  return "none";
};
