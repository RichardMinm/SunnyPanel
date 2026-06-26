import { createClarifyIntent, type AgentIntent } from "../schemas";

export type LLMRouterAction =
  | "cancel"
  | "capability"
  | "chat"
  | "clarify"
  | "create"
  | "delete"
  | "expand_answer"
  | "explain"
  | "query"
  | "summarize"
  | "update";

export type LLMRouterTarget =
  | "agent"
  | "checklist"
  | "last_topic"
  | "memory"
  | "plan"
  | "schedule"
  | "timeline"
  | "unknown"
  | "writing";

export type LLMRouterRiskLevel = "high" | "low" | "medium" | "none";

export type LLMRouterSlots = {
  changeDescription?: string;
  date?: string;
  endTime?: string;
  entityName?: string;
  entityType?: "checklist" | "plan" | "schedule" | "timeline" | "writing";
  sourceText?: string;
  startTime?: string;
  title?: string;
  topic?: string;
};

export type LLMRouterOutput = {
  action: LLMRouterAction;
  clarification?: {
    missingFields?: string[];
    question?: string;
    reason?: string;
  };
  confidence: number;
  needsClarification: boolean;
  requiresConfirmation: boolean;
  riskLevel: LLMRouterRiskLevel;
  slots: LLMRouterSlots;
  target: LLMRouterTarget;
  topic?: string;
  userVisibleReason: string;
  writeRequired: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown) => (typeof value === "string" ? value : undefined);

const asNumber = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);

const asBool = (value: unknown) => (typeof value === "boolean" ? value : undefined);

const VALID_ACTIONS = new Set<LLMRouterAction>([
  "query",
  "create",
  "update",
  "delete",
  "cancel",
  "summarize",
  "explain",
  "expand_answer",
  "capability",
  "clarify",
  "chat",
]);

const VALID_TARGETS = new Set<LLMRouterTarget>([
  "plan",
  "schedule",
  "checklist",
  "memory",
  "timeline",
  "writing",
  "agent",
  "last_topic",
  "unknown",
]);

const VALID_RISK = new Set<LLMRouterRiskLevel>(["none", "low", "medium", "high"]);

export const isLLMRouterV2Enabled = () =>
  process.env.AGENT_LLM_ROUTER_V2 === "1" || process.env.AGENT_LLM_ROUTER_V2 === "true";

export const createClarifyRouterOutput = (question: string, reason?: string): LLMRouterOutput => ({
  action: "clarify",
  clarification: { question, reason },
  confidence: 0.4,
  needsClarification: true,
  requiresConfirmation: false,
  riskLevel: "none",
  slots: { sourceText: question },
  target: "unknown",
  userVisibleReason: reason ?? question,
  writeRequired: false,
});

export const parseLLMRouterOutput = (raw: unknown): LLMRouterOutput | null => {
  if (!isRecord(raw)) {
    return null;
  }

  const router = isRecord(raw.router) ? raw.router : raw;
  const action = asString(router.action);

  if (!action || !VALID_ACTIONS.has(action as LLMRouterAction)) {
    return null;
  }

  const target = asString(router.target) ?? "unknown";

  if (!VALID_TARGETS.has(target as LLMRouterTarget)) {
    return null;
  }

  const riskLevel = asString(router.riskLevel) ?? "none";

  if (!VALID_RISK.has(riskLevel as LLMRouterRiskLevel)) {
    return null;
  }

  const slotsRaw = isRecord(router.slots) ? router.slots : {};
  const clarificationRaw = isRecord(router.clarification) ? router.clarification : undefined;

  return {
    action: action as LLMRouterAction,
    clarification: clarificationRaw
      ? {
          missingFields: Array.isArray(clarificationRaw.missingFields)
            ? clarificationRaw.missingFields.filter((item): item is string => typeof item === "string")
            : undefined,
          question: asString(clarificationRaw.question),
          reason: asString(clarificationRaw.reason),
        }
      : undefined,
    confidence: asNumber(router.confidence) ?? 0.5,
    needsClarification: asBool(router.needsClarification) ?? action === "clarify",
    requiresConfirmation: asBool(router.requiresConfirmation) ?? false,
    riskLevel: riskLevel as LLMRouterRiskLevel,
    slots: {
      changeDescription: asString(slotsRaw.changeDescription),
      date: asString(slotsRaw.date),
      endTime: asString(slotsRaw.endTime),
      entityName: asString(slotsRaw.entityName),
      entityType:
        slotsRaw.entityType === "plan" ||
        slotsRaw.entityType === "schedule" ||
        slotsRaw.entityType === "checklist" ||
        slotsRaw.entityType === "timeline" ||
        slotsRaw.entityType === "writing"
          ? slotsRaw.entityType
          : undefined,
      sourceText: asString(slotsRaw.sourceText),
      startTime: asString(slotsRaw.startTime),
      title: asString(slotsRaw.title),
      topic: asString(slotsRaw.topic),
    },
    target: target as LLMRouterTarget,
    topic: asString(router.topic),
    userVisibleReason: asString(router.userVisibleReason) ?? `router action=${action}`,
    writeRequired: asBool(router.writeRequired) ?? ["create", "update", "delete", "cancel"].includes(action),
  };
};

export const parseLLMRouterOutputWithRetry = async (
  parseContent: () => string | null,
  retry: () => Promise<string | null>,
): Promise<{ output: LLMRouterOutput; retried: boolean }> => {
  const first = parseContent();
  const firstParsed = first ? parseLLMRouterOutput(JSON.parse(first)) : null;

  if (firstParsed) {
    return { output: firstParsed, retried: false };
  }

  try {
    const secondContent = await retry();
    const secondParsed = secondContent ? parseLLMRouterOutput(JSON.parse(secondContent)) : null;

    if (secondParsed) {
      return { output: secondParsed, retried: true };
    }
  } catch {
    // fall through to clarify
  }

  return {
    output: createClarifyRouterOutput("我需要再确认一下你的具体需求，能补充更多细节吗？"),
    retried: true,
  };
};

export const llmRouterOutputToClarifyIntent = (router: LLMRouterOutput): AgentIntent =>
  createClarifyIntent(
    router.clarification?.question ?? router.userVisibleReason,
    router.clarification?.missingFields,
  );
