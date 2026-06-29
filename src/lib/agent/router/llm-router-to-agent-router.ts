import type { AgentIntent } from "../schemas";
import { normalizeRouterOutput } from "./normalize-router-output";
import type { LLMRouterOutput } from "./llm-router-schema";
import type { AgentRouterOutput } from "./types";

export const agentRouterFromLLM = (input: {
  intent: AgentIntent;
  llmRouter: LLMRouterOutput;
}): AgentRouterOutput => {
  const normalized = normalizeRouterOutput({ intent: input.intent });
  const actionMap: Record<LLMRouterOutput["action"], AgentRouterOutput["action"]> = {
    cancel: "delete",
    capability: "capability",
    chat: "answer",
    clarify: "clarify",
    create: "create",
    delete: "delete",
    expand_answer: "expand",
    explain: "answer",
    query: "query",
    summarize: "answer",
    update: "update",
  };

  return {
    ...normalized,
    action: actionMap[input.llmRouter.action] ?? normalized.action,
    confidence: input.llmRouter.confidence,
    reason: input.llmRouter.userVisibleReason,
    requiresWrite: input.llmRouter.writeRequired,
    target: {
      ...normalized.target,
      entityName: input.llmRouter.slots.entityName ?? normalized.target.entityName,
      entityType: input.llmRouter.slots.entityType ?? normalized.target.entityType,
      kind: input.llmRouter.target === "last_topic" ? "last_topic" : normalized.target.kind,
      topic: input.llmRouter.topic ?? input.llmRouter.slots.topic ?? normalized.target.topic,
    },
  };
};

export const agentRouterToLLMRouter = (router: AgentRouterOutput): LLMRouterOutput => {
  const actionMap: Record<AgentRouterOutput["action"], LLMRouterOutput["action"]> = {
    answer: "explain",
    capability: "capability",
    clarify: "clarify",
    create: "create",
    delete: "delete",
    expand: "expand_answer",
    query: "query",
    update: "update",
  };

  const target = router.target.entityType
    ? router.target.entityType
    : router.target.kind === "last_topic"
      ? "last_topic"
      : router.target.collection === "schedule-items"
        ? "schedule"
        : router.target.collection === "checklists"
          ? "checklist"
          : router.target.collection === "timeline-events"
            ? "timeline"
            : router.target.collection === "plans"
              ? "plan"
              : "unknown";

  return {
    action: actionMap[router.action] ?? "chat",
    confidence: router.confidence,
    needsClarification: router.action === "clarify",
    requiresConfirmation: router.requiresWrite && router.action !== "query",
    riskLevel: router.action === "delete" ? "high" : router.requiresWrite ? "medium" : "none",
    slots: {
      changeDescription:
        router.intent.intent === "modify_record" && "changeDescription" in router.intent.args
          ? String(router.intent.args.changeDescription ?? "")
          : undefined,
      entityName: router.target.entityName ?? undefined,
      entityType: router.target.entityType ?? undefined,
      sourceText: router.reason,
      title:
        "title" in router.intent.args && typeof router.intent.args.title === "string"
          ? router.intent.args.title
          : router.target.entityName ?? undefined,
      topic: router.target.topic ?? undefined,
    },
    target: target as LLMRouterOutput["target"],
    topic: router.target.topic ?? undefined,
    userVisibleReason: router.reason,
    writeRequired: router.requiresWrite,
  };
};
