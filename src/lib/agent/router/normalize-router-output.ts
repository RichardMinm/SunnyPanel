import type { AgentArbitrationDecision } from "../intent/arbitration";
import { isAgentWriteIntent } from "../intent/write-intents";
import { isConversationalAgentIntent } from "../conversation/types";
import { isConversationalIntent } from "../schemas";
import type { AgentIntent } from "../schemas";
import type { AgentRouterAction, AgentRouterOutput, AgentTargetRef } from "./types";

const intentToAction = (intent: AgentIntent): AgentRouterAction => {
  if (intent.intent === "clarify") {
    return "clarify";
  }

  if (intent.intent === "capability_query") {
    return "capability";
  }

  if (isConversationalIntent(intent.intent)) {
    if (intent.intent === "expand_answer") {
      return "expand";
    }

    return "answer";
  }

  if (intent.intent === "answer_question") {
    return "answer";
  }

  if (
    intent.intent === "query_progress" ||
    intent.intent === "query_plan_progress" ||
    intent.intent === "evaluate_plan" ||
    intent.intent.startsWith("query_")
  ) {
    return "query";
  }

  if (intent.intent === "delete_record" || intent.intent === "cancel_schedule_item") {
    return "delete";
  }

  if (
    intent.intent === "modify_record" ||
    intent.intent === "reschedule_item" ||
    intent.intent === "complete_plan_item" ||
    intent.intent === "add_completion_note" ||
    intent.intent === "append_plan_item"
  ) {
    return "update";
  }

  if (isAgentWriteIntent(intent.intent)) {
    return "create";
  }

  // Handle draft intents for checklist / writing that the LLM router may output
  // but that aren't yet in the AgentIntent discriminated union.
  if (intent.intent === ("draft_checklist" as string) || intent.intent === ("draft_writing_outline" as string)) {
    return "create";
  }

  return "answer";
};

const extractTarget = (intent: AgentIntent): AgentTargetRef => {
  if (isConversationalAgentIntent(intent)) {
    return {
      kind: intent.args.target === "last_topic" ? "last_topic" : "named",
      topic: intent.args.topic,
    };
  }

  if (intent.intent === "delete_record" || intent.intent === "modify_record") {
    return {
      entityName: intent.args.entityName,
      entityType: intent.args.entityType,
      targetId: intent.args.targetId ?? null,
    };
  }

  // Intent-based target extraction for write intents that don't carry entityType in args.
  // Some of these (draft_writing_outline, draft_checklist) aren't yet in the AgentIntent
  // discriminated union but may be output by the LLM router.
  const intentName: string = intent.intent;
  if (intentName === "create_plan") {
    return { entityType: "plan" };
  }

  if (intentName === "create_checklist") {
    return { entityType: "checklist" };
  }

  if (
    intentName === "compose_schedule_item" ||
    intentName === "create_schedule_items" ||
    intentName === "reschedule_item" ||
    intentName === "cancel_schedule_item"
  ) {
    return { entityType: "schedule" };
  }

  if (intentName === "compose_timeline_event") {
    return { entityType: "timeline" };
  }

  if (intentName === "draft_writing_outline") {
    return { entityType: "writing" };
  }

  if (intentName === "draft_checklist") {
    return { entityType: "checklist" };
  }

  if (intent.intent === "query_plan_progress") {
    return {
      entityName: intent.args.planTitle ?? null,
      targetId: intent.args.planId ?? null,
      kind: "named",
      topic: intent.args.planTitle ?? null,
    };
  }

  if (intent.intent === "answer_question" && intent.args.openDomainTopic) {
    return {
      kind: "named",
      topic: intent.args.openDomainTopic,
    };
  }

  if (intent.intent === "answer_question" && intent.args.learningContext?.subject) {
    return {
      kind: "named",
      topic: intent.args.learningContext.subject,
    };
  }

  return {};
};

export const normalizeRouterOutput = (input: {
  arbitration?: AgentArbitrationDecision | null;
  intent: AgentIntent;
}): AgentRouterOutput => {
  const { arbitration, intent } = input;
  const action = intentToAction(intent);
  const requiresWrite =
    arbitration?.requiresWrite ??
    (action === "create" || action === "update" || action === "delete");

  return {
    action,
    confidence: arbitration?.confidence ?? intent.confidence ?? 0.5,
    intent,
    reason: arbitration?.reason ?? `normalized from intent ${intent.intent}`,
    requiresWrite,
    target: extractTarget(intent),
  };
};
