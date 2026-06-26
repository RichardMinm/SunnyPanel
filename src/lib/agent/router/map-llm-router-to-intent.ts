import { buildConversationalIntent } from "../conversation/answer-generator";
import type { AgentConversationState } from "../conversation/types";
import { createClarifyIntent, type AgentIntent } from "../schemas";
import type { LLMRouterOutput } from "./llm-router-schema";

const todayIso = () => new Date().toISOString().split("T")[0];

export const mapLLMRouterToIntent = (
  router: LLMRouterOutput,
  message: string,
  conversationState?: AgentConversationState | null,
): AgentIntent => {
  const slots = router.slots;
  const sourceText = slots.sourceText ?? message;

  if (router.needsClarification || router.action === "clarify") {
    return createClarifyIntent(
      router.clarification?.question ?? router.userVisibleReason,
      router.clarification?.missingFields,
    );
  }

  if (router.action === "capability") {
    return {
      args: { answer: router.userVisibleReason || "我可以帮你管理计划、日程、清单和时间线。" },
      confidence: router.confidence,
      intent: "capability_query",
    };
  }

  if (router.action === "expand_answer" || router.action === "explain" || router.action === "summarize") {
    const topic =
      router.target === "last_topic"
        ? conversationState?.lastTopic ?? router.topic ?? slots.topic ?? "该主题"
        : router.topic ?? slots.topic ?? conversationState?.lastTopic ?? "该主题";

    const kind =
      router.action === "expand_answer"
        ? "expand_answer"
        : router.action === "summarize"
          ? "summarize_answer"
          : "explain_concept";

    return buildConversationalIntent(kind, topic, message, conversationState ?? undefined);
  }

  if (router.action === "chat") {
    return {
      args: { answer: router.userVisibleReason || "我在这里，可以继续问我。" },
      confidence: router.confidence,
      intent: "answer_question",
    };
  }

  if (router.action === "query") {
    if (router.target === "schedule") {
      return { args: {}, confidence: router.confidence, intent: "query_schedule" };
    }

    if (router.target === "checklist") {
      return {
        args: { checklistTitle: slots.title ?? slots.entityName ?? undefined },
        confidence: router.confidence,
        intent: "query_checklist_progress",
      };
    }

    if (router.target === "plan") {
      return {
        args: { planTitle: slots.title ?? slots.entityName ?? undefined },
        confidence: router.confidence,
        intent: "query_plan_progress",
      };
    }

    if (router.target === "memory") {
      return { args: { answer: sourceText }, confidence: router.confidence, intent: "query_memory" };
    }

    if (router.target === "timeline") {
      return { args: {}, confidence: router.confidence, intent: "query_timeline" };
    }

    return { args: { scope: "all" }, confidence: router.confidence, intent: "query_progress" };
  }

  if (router.action === "create") {
    if (router.target === "schedule") {
      return {
        args: {
          date: slots.date ?? todayIso(),
          endTime: slots.endTime ?? null,
          sourceText,
          startTime: slots.startTime ?? null,
          title: slots.title ?? "新日程",
        },
        confidence: router.confidence,
        intent: "compose_schedule_item",
      };
    }

    if (router.target === "timeline") {
      return {
        args: { eventDate: slots.date ?? todayIso(), sourceText },
        confidence: router.confidence,
        intent: "compose_timeline_event",
      };
    }

    if (router.target === "checklist") {
      return {
        args: { checklistTitle: slots.title ?? sourceText.slice(0, 40) },
        confidence: router.confidence,
        intent: "draft_checklist",
      } as unknown as AgentIntent;
    }

    return {
      args: { title: (slots.title ?? sourceText.slice(0, 40)) || "新计划" },
      confidence: router.confidence,
      intent: "create_plan",
    };
  }

  if (router.action === "update" || router.action === "cancel") {
    const entityType: "checklist" | "plan" | "schedule" | "timeline" =
      router.target === "schedule"
        ? "schedule"
        : router.target === "checklist"
          ? "checklist"
          : router.target === "timeline"
            ? "timeline"
            : "plan";

    if (router.action === "cancel" && router.target === "schedule") {
      return {
        args: { entityName: slots.entityName ?? slots.title ?? "日程", entityType: "schedule" as const },
        confidence: router.confidence,
        intent: "delete_record",
      };
    }

    return {
      args: {
        changeDescription: slots.changeDescription ?? sourceText,
        entityName: slots.entityName ?? slots.title ?? "目标",
        entityType,
      },
      confidence: router.confidence,
      intent: "modify_record",
    };
  }

  if (router.action === "delete") {
    const entityType: "checklist" | "plan" | "schedule" | "timeline" =
      router.target === "schedule"
        ? "schedule"
        : router.target === "checklist"
          ? "checklist"
          : router.target === "timeline"
            ? "timeline"
            : "plan";

    return {
      args: {
        entityName: (slots.entityName ?? slots.title ?? sourceText.replace(/删除|删掉|移除/g, "").trim()) || "目标",
        entityType,
      },
      confidence: router.confidence,
      intent: "delete_record",
    };
  }

  return createClarifyIntent(router.userVisibleReason);
};
