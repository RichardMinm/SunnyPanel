import { useMemo, useState } from "react";
import { AgentMarkdownBubble } from "./AgentMarkdownBubble";
import { ChecklistCompletionCard } from "./ChecklistCompletionCard";
import { PlanOverviewCard } from "./PlanOverviewCard";
import { ScheduleResultCard } from "./ScheduleResultCard";
import {
  parseChecklistCompletion,
  parsePlanOverview,
  parseScheduleResultMessage,
} from "./utils";
import { DashboardIcon } from "../icons";

type MessageCardProps = {
  content: string;
  isStreaming?: boolean;
  isThinking?: boolean;
  role: "assistant" | "user";
  thinkingContent?: string;
};

export function MessageCard({
  content,
  isStreaming,
  isThinking,
  role,
  thinkingContent,
}: MessageCardProps) {
  const [thinkingOpen, setThinkingOpen] = useState(isThinking === true);

  // Only attempt structured parsing when NOT streaming (avoid false positives during generation)
  const structuredCard = useMemo(() => {
    if (role !== "assistant" || isStreaming || !content) return null;
    const scheduleResult = parseScheduleResultMessage(content);
    if (scheduleResult) return { type: "schedule" as const, data: scheduleResult };
    const checklistResult = parseChecklistCompletion(content);
    if (checklistResult) return { type: "checklist" as const, data: checklistResult };
    const planResult = parsePlanOverview(content);
    if (planResult) return { type: "plan" as const, data: planResult };
    return null;
  }, [content, isStreaming, role]);

  // 自动展开：正在思考时展开，思考完成后折叠
  if (isThinking && !thinkingOpen) {
    // 仅在流式思考中自动展开
  }

  const hasThinking = Boolean(thinkingContent?.trim());
  const thinkingSteps = hasThinking
    ? thinkingContent!.split(/\n{2,}/).filter(Boolean)
    : [];

  const renderAssistantContent = () => {
    if (!structuredCard) {
      return (
        <AgentMarkdownBubble
          content={content || (isStreaming ? "正在生成回复..." : "")}
          isStreaming={isStreaming && Boolean(content)}
        />
      );
    }

    switch (structuredCard.type) {
      case "schedule":
        return <ScheduleResultCard result={structuredCard.data} />;
      case "checklist":
        return <ChecklistCompletionCard data={structuredCard.data} />;
      case "plan":
        return <PlanOverviewCard data={structuredCard.data} />;
      default:
        return (
          <AgentMarkdownBubble
            content={content || (isStreaming ? "正在生成回复..." : "")}
            isStreaming={isStreaming && Boolean(content)}
          />
        );
    }
  };

  const body = (
    <div className="sunny-message-card-body">
      {role === "assistant" ? <span className="sunny-message-card-assistant-name">Sunny</span> : null}
      {role === "assistant" && hasThinking ? (
        <div className="sunny-thinking-fold">
          <button
            type="button"
            className="sunny-thinking-fold-header"
            onClick={() => setThinkingOpen((v) => !v)}
          >
            <span className={`sunny-thinking-fold-arrow${thinkingOpen ? " is-open" : ""}`}>
              <DashboardIcon name="chevronDown" />
            </span>
            <span className="sunny-thinking-icon"><DashboardIcon name="thinking" /></span> 思考过程
            {thinkingSteps.length > 1 ? ` (${thinkingSteps.length} 步)` : ""}
          </button>
          {thinkingOpen ? (
            <div className="sunny-thinking-fold-body">{thinkingContent}</div>
          ) : null}
        </div>
      ) : null}
      {role === "assistant" ? (
        renderAssistantContent()
      ) : (
        <p className="sunny-message-card-user-text">{content}</p>
      )}
    </div>
  );

  const avatar = role === "assistant" ? (
    <div className="sunny-message-card-avatar" aria-hidden="true">
      S
    </div>
  ) : null;

  return (
    <div className={`sunny-message-card sunny-message-card-${role}`}>
      {avatar}
      {body}
    </div>
  );
}
