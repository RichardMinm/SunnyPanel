import type { AgentRouterAction, AgentRouterOutput } from "../router/types";
import {
  getCapability,
  listCapabilities,
  listExposableCapabilities,
} from "./registry";
import { capabilityForLegacyIntent, legacyIntentForCapability } from "./adapters";
import type { AgentWriteIntentName } from "../schemas";
import type { AgentCapability, CapabilityGateInput, CapabilityGateResult } from "./types";

const capabilityNames = () => listCapabilities().map((cap) => cap.name);

const matchesPrefix = (name: string, prefix: string) => name.startsWith(prefix);

const entityTypeToCapTarget = (entityType: string | null | undefined): AgentCapability["target"] | null => {
  switch (entityType) {
    case "plan":
      return "plan";
    case "schedule":
      return "schedule";
    case "checklist":
      return "checklist";
    case "timeline":
      return "timeline";
    case "writing":
      return "writing";
    default:
      return null;
  }
};

const actionAllows = (action: AgentRouterAction, name: string, target?: AgentRouterOutput["target"]): boolean => {
  const cap = getCapability(name);

  if (!cap) {
    return false;
  }

  let actionOk = false;

  switch (action) {
    case "query":
      actionOk = matchesPrefix(name, "search_");
      break;
    case "answer":
    case "capability":
    case "clarify":
    case "expand":
      actionOk = !cap.sideEffect && cap.risk === "read";
      break;
    case "create":
      actionOk =
        matchesPrefix(name, "search_") ||
        matchesPrefix(name, "draft_") ||
        matchesPrefix(name, "preview_create_");
      break;
    case "update":
      actionOk = matchesPrefix(name, "search_") || matchesPrefix(name, "preview_update_");
      break;
    case "delete":
      actionOk = matchesPrefix(name, "search_") || matchesPrefix(name, "preview_delete_");
      break;
    default:
      return false;
  }

  if (!actionOk) {
    return false;
  }

  // Target narrowing: if router has an entityType, verify cap.target matches.
  // Skip for answer/clarify/capability/expand actions (no well-defined target).
  if (
    action !== "answer" &&
    action !== "clarify" &&
    action !== "capability" &&
    action !== "expand"
  ) {
    const expectedTarget = entityTypeToCapTarget(target?.entityType);
    if (expectedTarget && cap.target !== expectedTarget && cap.target !== "global") {
      return false;
    }
  }

  return true;
};

const denyReasonForAction = (action: AgentRouterAction, name: string): string => {
  const cap = getCapability(name);

  if (!cap) {
    return "未注册的能力";
  }

  if (cap.action === "execute" || cap.risk === "write_execute" || cap.risk === "dangerous") {
    return "execute/dangerous 能力不对 LLM 或 Router 直接开放";
  }

  return `action=${action} 不允许 ${name}`;
};

const mapDeniedIntentToCapabilities = (deniedIntents: Set<string>): Set<string> => {
  const blocked = new Set<string>();

  for (const intent of deniedIntents) {
    const preview = capabilityForLegacyIntent(intent as AgentWriteIntentName, "preview");
    const execute = capabilityForLegacyIntent(intent as AgentWriteIntentName, "execute");

    if (preview) {
      blocked.add(preview);
    }

    if (execute) {
      blocked.add(execute);
    }

    blocked.add(intent);
  }

  return blocked;
};

export const getAllowedCapabilities = (input: CapabilityGateInput): CapabilityGateResult => {
  const { intent, resolverStatus, router, userContext } = input;
  const allowed: string[] = [];
  const blocked: CapabilityGateResult["blocked"] = [];
  const deniedCapabilities = mapDeniedIntentToCapabilities(userContext.preferences?.deniedIntents ?? new Set());

  for (const name of capabilityNames()) {
    if (deniedCapabilities.has(name)) {
      blocked.push({ name, reason: "用户偏好禁止该能力" });
      continue;
    }

    if (!actionAllows(router.action, name, router.target)) {
      blocked.push({ name, reason: denyReasonForAction(router.action, name) });
      continue;
    }

    if (
      resolverStatus &&
      resolverStatus !== "unique" &&
      (matchesPrefix(name, "preview_") || matchesPrefix(name, "execute_"))
    ) {
      blocked.push({ name, reason: `目标解析状态 ${resolverStatus}，禁止 preview/execute` });
      continue;
    }

    allowed.push(name);
  }

  const writeIntent = intent.intent as AgentWriteIntentName;
  const mappedPreview = capabilityForLegacyIntent(writeIntent, "preview");

  if (
    mappedPreview &&
    router.action !== "query" &&
    !allowed.includes(mappedPreview) &&
    legacyIntentForCapability(mappedPreview)
  ) {
    blocked.push({
      name: mappedPreview,
      reason: `当前 intent ${writeIntent} 映射的 preview 不在允许列表`,
    });
  }

  const exposableToLLM = allowed.filter((name) => {
    const cap = getCapability(name);

    return (
      cap?.exposableToLLM === true &&
      cap.risk !== "write_execute" &&
      cap.risk !== "dangerous"
    );
  });

  return { allowed, blocked, exposableToLLM };
};

/** Router 未知时的保守默认：仅暴露 read + draft（不含 preview execute）。 */
export const getDefaultExposableCapabilities = (): string[] =>
  listExposableCapabilities()
    .filter((cap) => cap.risk === "read" || cap.risk === "draft")
    .map((cap) => cap.name);

export const getAllExposableCapabilities = (): string[] =>
  listExposableCapabilities().map((cap) => cap.name);
