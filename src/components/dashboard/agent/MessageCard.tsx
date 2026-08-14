"use client";

import { useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AgentActivityTimeline } from "./AgentActivityTimeline";
import { ActionResultCard } from "./ActionResultCard";
import { AgentMarkdownBubble } from "./AgentMarkdownBubble";
import { AgentMessageActions } from "./AgentMessageActions";
import { ChecklistCompletionCard } from "./ChecklistCompletionCard";
import { ChecklistDraftCard } from "./ChecklistDraftCard";
import { PlanDraftCard } from "./PlanDraftCard";
import { PlanOverviewCard } from "./PlanOverviewCard";
import { ScheduleDraftCard } from "./ScheduleDraftCard";
import { ScheduleQueryCard } from "./ScheduleQueryCard";
import { ScheduleResultCard } from "./ScheduleResultCard";
import {
  parseActionResultMessage,
  parseChecklistCompletion,
  parsePlanOverview,
  parseScheduleQuerySummary,
  parseScheduleResultMessage,
} from "./utils";
import type { ChecklistDraft } from "@/lib/agent/planning/checklist-draft";
import type { PlanDraft } from "@/lib/agent/planning/draft";
import type { ScheduleDraft } from "@/lib/agent/schedule/draft";
import type { AgentActivityStep } from "@/lib/agent/activity";
import type { AgentMessageDeliveryState } from "@/lib/agent/schemas";
import { useDashboardMotion } from "../motion/dashboard-motion";

type MessageCardProps = {
  activitySteps?: AgentActivityStep[];
  content: string;
  deliveryState?: AgentMessageDeliveryState;
  isStreaming?: boolean;
  onChecklistDraftPrepareCreate?: () => void;
  onPlanDraftGenerateChecklist?: () => void;
  onPlanDraftPrepareCreate?: () => void;
  onPlanDraftRevise?: () => void;
  onRetry?: () => void;
  onScheduleDraftPrepareCreate?: () => void;
  onScheduleDraftRevise?: () => void;
  planningChecklistDraft?: ChecklistDraft | null;
  planningDraft?: PlanDraft | null;
  role: "assistant" | "user";
  schedulingDraft?: ScheduleDraft | null;
};

export function MessageCard({
  activitySteps = [],
  content,
  deliveryState,
  isStreaming,
  onChecklistDraftPrepareCreate,
  onPlanDraftGenerateChecklist,
  onPlanDraftPrepareCreate,
  onPlanDraftRevise,
  onRetry,
  onScheduleDraftPrepareCreate,
  onScheduleDraftRevise,
  planningChecklistDraft,
  planningDraft,
  role,
  schedulingDraft,
}: MessageCardProps) {
  const { agentSurfaceView } = useDashboardMotion();
  // Only attempt structured parsing when NOT streaming (avoid false positives during generation)
  const structuredCard = useMemo(() => {
    if (role !== "assistant" || isStreaming || !content) return null;
    const actionResult = parseActionResultMessage(content);
    if (actionResult) return { type: "action_result" as const, data: actionResult };
    const scheduleQuery = parseScheduleQuerySummary(content);
    if (scheduleQuery) return { type: "schedule_query" as const, data: scheduleQuery };
    const scheduleResult = parseScheduleResultMessage(content);
    if (scheduleResult) return { type: "schedule" as const, data: scheduleResult };
    const checklistResult = parseChecklistCompletion(content);
    if (checklistResult) return { type: "checklist" as const, data: checklistResult };
    const planResult = parsePlanOverview(content);
    if (planResult) return { type: "plan" as const, data: planResult };
    return null;
  }, [content, isStreaming, role]);

  const hasUserActivitySteps = activitySteps.some(
    (step) => step.visibility !== "developer",
  );
  const hasProductCard = Boolean(
    planningChecklistDraft ||
      planningDraft ||
      schedulingDraft ||
      structuredCard,
  );
  const showMessageActions =
    role === "assistant" &&
    !isStreaming &&
    !deliveryState &&
    !hasProductCard &&
    content.trim().length > 0;
  const assistantContentKey = planningChecklistDraft
    ? "checklist-draft"
    : planningDraft
      ? "plan-draft"
      : schedulingDraft
        ? "schedule-draft"
        : structuredCard
          ? `structured-${structuredCard.type}`
          : "markdown";

  const renderAssistantContent = () => {
    if (planningChecklistDraft && !isStreaming) {
      return <ChecklistDraftCard draft={planningChecklistDraft} onPrepareCreate={onChecklistDraftPrepareCreate} />;
    }

    if (planningDraft && !isStreaming) {
      return (
        <PlanDraftCard
          draft={planningDraft}
          onGenerateChecklist={onPlanDraftGenerateChecklist}
          onPrepareCreate={onPlanDraftPrepareCreate}
          onRevise={onPlanDraftRevise}
        />
      );
    }

    if (schedulingDraft && !isStreaming) {
      return (
        <ScheduleDraftCard
          draft={schedulingDraft}
          onPrepareCreate={onScheduleDraftPrepareCreate}
          onRevise={onScheduleDraftRevise}
        />
      );
    }

    if (!structuredCard) {
      const fallbackContent = content ||
        (isStreaming && !hasUserActivitySteps ? "正在处理请求" : "");

      if (!fallbackContent) {
        return null;
      }

      return (
        <AgentMarkdownBubble
          content={fallbackContent}
          isStreaming={isStreaming && Boolean(content)}
        />
      );
    }

    switch (structuredCard.type) {
      case "action_result":
        return <ActionResultCard data={structuredCard.data} />;
      case "schedule_query":
        return <ScheduleQueryCard summary={structuredCard.data} />;
      case "schedule":
        return <ScheduleResultCard result={structuredCard.data} />;
      case "checklist":
        return <ChecklistCompletionCard data={structuredCard.data} />;
      case "plan":
        return <PlanOverviewCard data={structuredCard.data} />;
      default:
        return (
          <AgentMarkdownBubble
            content={
              content ||
              (isStreaming && !hasUserActivitySteps ? "正在处理请求" : "")
            }
            isStreaming={isStreaming && Boolean(content)}
          />
        );
    }
  };

  const body = (
    <div className="sunny-message-card-body">
      {role === "user" ? (
        <p className="sunny-message-card-user-text">{content}</p>
      ) : (
        <>
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              animate={agentSurfaceView.animate}
              className="sunny-agent-content-transition"
              exit={agentSurfaceView.exit}
              initial={agentSurfaceView.initial}
              key={assistantContentKey}
              transition={agentSurfaceView.transition}
            >
              {renderAssistantContent()}
            </motion.div>
          </AnimatePresence>
          {deliveryState ? (
            <div className={`sunny-agent-delivery-notice is-${deliveryState}`} role="status">
              <span>
                {deliveryState === "partial"
                  ? "回复中断，已有内容未保存"
                  : deliveryState === "cancelled"
                    ? "已停止生成，未完成内容不会保存"
                    : "暂时未能生成回复"}
              </span>
              {onRetry ? (
                <button onClick={onRetry} type="button">重试</button>
              ) : null}
            </div>
          ) : null}
          {showMessageActions ? <AgentMessageActions content={content} /> : null}
          <AgentActivityTimeline steps={activitySteps} />
        </>
      )}
    </div>
  );

  return (
    <div
      className={`sunny-message-card sunny-message-card-${role}${hasProductCard ? " has-product-card" : ""}`}
    >
      {role === "assistant" ? (
        <>
          <span aria-hidden="true" className="sunny-message-card-assistant-mark">S</span>
          <div className="sunny-message-card-assistant-content">{body}</div>
        </>
      ) : body}
    </div>
  );
}
