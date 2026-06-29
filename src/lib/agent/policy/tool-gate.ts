import type { AgentRouterAction, AgentRouterOutput } from "../router/types";
import type { AgentIntent, AgentWriteIntentName } from "../schemas";
import { getAllowedCapabilities } from "../capabilities/tool-gate";
import { legacyIntentForCapability } from "../capabilities/adapters";
import { agentToolRegistry } from "../tool-registry";
import {
  actionAllowsDryRun,
  actionForbidsDryRun,
  getWriteToolsForAction,
  isReadOnlyIntent,
  requiresHighRisk,
} from "./rules";

export type PolicyGuardResult = {
  allowed: boolean;
  allowedCapabilities?: string[];
  allowedTools: string[];
  blockedCapabilities?: Array<{ name: string; reason: string }>;
  exposableToLLM?: string[];
  plannedTools: string[];
  reason: string;
};

const registryToolNames = () => Object.keys(agentToolRegistry);

const capabilitiesToLegacyTools = (capabilityNames: readonly string[]): string[] => {
  const tools = new Set<string>();

  for (const name of capabilityNames) {
    const legacy = legacyIntentForCapability(name);

    if (legacy) {
      tools.add(legacy);
    }
  }

  return [...tools];
};

export const getAllowedToolsForAction = (action: AgentRouterAction): string[] => {
  const writeTools = getWriteToolsForAction(action);

  if (writeTools.length === 0) {
    return action === "query" ? ["query_plan_progress", "query_progress", "evaluate_plan"] : [];
  }

  return [...writeTools];
};

export const evaluatePolicyGuard = (
  router: AgentRouterOutput,
  options: {
    resolverStatus?: import("../resolver/target-resolver").TargetResolutionStatus;
    userContext?: { preferences?: import("../user-preferences").UserPreferences | null; userId: number };
  } = {},
): PolicyGuardResult => {
  const { action, intent } = router;
  const capabilityGate = getAllowedCapabilities({
    intent,
    resolverStatus: options.resolverStatus,
    router,
    userContext: options.userContext ?? { userId: 0 },
  });
  const allowedToolsFromCapabilities = capabilitiesToLegacyTools(capabilityGate.allowed);
  const allowedTools =
    allowedToolsFromCapabilities.length > 0 ? allowedToolsFromCapabilities : getAllowedToolsForAction(action);
  const plannedTools =
    isReadOnlyIntent(intent.intent) || actionForbidsDryRun(action)
      ? []
      : actionAllowsDryRun(action)
        ? [intent.intent]
        : [];

  if (actionForbidsDryRun(action) && !isReadOnlyIntent(intent.intent)) {
    const writeIntent = intent.intent as AgentWriteIntentName;

    if (registryToolNames().includes(writeIntent)) {
      return {
        allowed: false,
        allowedCapabilities: capabilityGate.allowed,
        allowedTools,
        blockedCapabilities: capabilityGate.blocked,
        exposableToLLM: capabilityGate.exposableToLLM,
        plannedTools,
        reason: `${action} 动作不允许写入类 intent ${writeIntent}`,
      };
    }
  }

  if (actionAllowsDryRun(action)) {
    const writeIntent = intent.intent as AgentWriteIntentName;
    const permitted = getWriteToolsForAction(action);

    if (!permitted.includes(writeIntent)) {
      return {
        allowed: false,
        allowedCapabilities: capabilityGate.allowed,
        allowedTools,
        blockedCapabilities: capabilityGate.blocked,
        exposableToLLM: capabilityGate.exposableToLLM,
        plannedTools,
        reason: `intent ${writeIntent} 不在 action=${action} 允许的工具池内`,
      };
    }

    if (requiresHighRisk(writeIntent) && router.intent.intent === "delete_record") {
      return {
        allowed: true,
        allowedCapabilities: capabilityGate.allowed,
        allowedTools,
        blockedCapabilities: capabilityGate.blocked,
        exposableToLLM: capabilityGate.exposableToLLM,
        plannedTools,
        reason: "delete 动作已通过 Policy Guard，需 high risk + 确认",
      };
    }
  }

  if (
    options.resolverStatus &&
    options.resolverStatus !== "unique" &&
    actionAllowsDryRun(action) &&
    !isReadOnlyIntent(intent.intent)
  ) {
    return {
      allowed: false,
      allowedCapabilities: capabilityGate.allowed,
      allowedTools,
      blockedCapabilities: capabilityGate.blocked,
      exposableToLLM: capabilityGate.exposableToLLM,
      plannedTools,
      reason: `目标解析状态 ${options.resolverStatus}，禁止 preview`,
    };
  }

  return {
    allowed: true,
    allowedCapabilities: capabilityGate.allowed,
    allowedTools,
    blockedCapabilities: capabilityGate.blocked,
    exposableToLLM: capabilityGate.exposableToLLM,
    plannedTools,
    reason: "Policy Guard 通过",
  };
};

export const assertIntentAllowedByPolicy = (
  router: AgentRouterOutput,
  intent: AgentIntent,
  options?: Parameters<typeof evaluatePolicyGuard>[1],
): PolicyGuardResult => {
  const result = evaluatePolicyGuard(router, options);

  if (!result.allowed) {
    return result;
  }

  if (isReadOnlyIntent(intent.intent)) {
    return result;
  }

  const writeIntent = intent.intent as AgentWriteIntentName;

  if (!result.allowedTools.includes(writeIntent) && actionAllowsDryRun(router.action)) {
    return {
      allowed: false,
      allowedCapabilities: result.allowedCapabilities,
      allowedTools: result.allowedTools,
      blockedCapabilities: result.blockedCapabilities,
      exposableToLLM: result.exposableToLLM,
      plannedTools: result.plannedTools,
      reason: `实际 intent ${writeIntent} 不在允许工具池 [${result.allowedTools.join(", ")}]`,
    };
  }

  return result;
};

export const filterFunctionToolsByAllowlist = (
  toolNames: readonly string[],
  allowlist: readonly string[],
): string[] => {
  if (allowlist.length === 0) {
    return [];
  }

  const allowed = new Set(allowlist);

  return toolNames.filter((name) => allowed.has(name));
};
