"use client";

import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { AgentChatMessage, PendingAction } from "@/lib/agent/schemas";
import type { AgentInboxSuggestion } from "@/lib/agent/suggestions";
import type { AgentQuickPrompt } from "@/lib/agent/quick-prompts";
import { riskLevelLabelMap } from "@/components/dashboard/agent/constants";
import { SectionGroup } from "@/components/dashboard/agent/SectionGroup";
import { TaskItem } from "@/components/dashboard/agent/TaskItem";
import { ThreadItem } from "@/components/dashboard/agent/ThreadItem";
import type { AgentRunSummary, AgentThreadSummary } from "@/components/dashboard/agent/types";
import {
  buildUnifiedAgentTasks,
  getPendingActionTone,
  getRiskTone,
  getRunTaskMeta,
  getRunTaskTone,
} from "@/components/dashboard/agent/task-row-display";
import { getPendingActionLabel } from "@/components/dashboard/agent/utils";

const normalizeSummaryText = (value: string) => value.trim().replace(/\s+/g, " ");

const truncateSummaryText = (value: string, maxLength = 86) => {
  const normalized = normalizeSummaryText(value);

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength).trimEnd()}...` : normalized;
};

const getLatestMessageByRole = (messages: AgentChatMessage[], role: AgentChatMessage["role"]) => {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];

    if (message.role === role && normalizeSummaryText(message.content).length > 0) {
      return message;
    }
  }

  return null;
};

const summarizePendingAction = (pendingAction: PendingAction) => {
  if (pendingAction.type === "await_confirmation") {
    return `等待确认：${truncateSummaryText(pendingAction.action.summary)}`;
  }

  if (pendingAction.type === "await_batch_confirmation") {
    return `等待确认 ${pendingAction.actions.length} 项操作：${truncateSummaryText(
      pendingAction.actions.map((action) => action.summary).join("；"),
    )}`;
  }

  if (pendingAction.type === "await_queue_resume") {
    return `等待继续：还有 ${pendingAction.deferredTaskIds.length} 个延后任务。`;
  }

  if (pendingAction.type === "await_strategy_resume") {
    return `等待策略恢复：${truncateSummaryText(pendingAction.reason)}`;
  }

  if (pendingAction.type === "await_learning_followup") {
    return `学习咨询进行中：${truncateSummaryText(pendingAction.subject)}。`;
  }

  if (pendingAction.type === "await_clarification") {
    return `等待补充信息：${truncateSummaryText(pendingAction.question)}`;
  }

  return `等待补充完成备注：${truncateSummaryText(
    [pendingAction.checklistTitle, pendingAction.groupTitle, pendingAction.itemTitle].filter(Boolean).join(" / "),
  )}`;
};

function buildConversationSummary(messages: AgentChatMessage[], pendingAction: null | PendingAction) {
  if (pendingAction) {
    return summarizePendingAction(pendingAction);
  }

  const latestUserMessage = getLatestMessageByRole(messages, "user");
  const latestAssistantMessage = getLatestMessageByRole(messages, "assistant");

  if (latestUserMessage && latestAssistantMessage) {
    return `最近你在推进「${truncateSummaryText(latestUserMessage.content, 42)}」，Agent 已回应「${truncateSummaryText(
      latestAssistantMessage.content,
      54,
    )}」。`;
  }

  if (latestUserMessage) {
    return `最近你在推进「${truncateSummaryText(latestUserMessage.content, 72)}」。`;
  }

  return "还没有新的对话内容。输入目标后，这里会沉淀当前会话摘要。";
}

export type DashboardSlidePanelProps = {
  disabled?: boolean;
  isThinking: boolean;
  messages: AgentChatMessage[];
  onArchiveThread?: (threadId: number, archived: boolean) => void;
  onLoadThread: (threadId: number) => void;
  onNewThread: () => void;
  onResizeStart?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onRunPrompt: (prompt: string) => void;
  onSearchThreads?: (query: string) => void;
  onSelectRun?: (runId: number) => void;
  onRunSuggestion: (suggestion: AgentInboxSuggestion) => void;
  pendingAction: null | PendingAction;
  quickPrompts: AgentQuickPrompt[];
  recentRuns: AgentRunSummary[];
  selectedRunId?: null | number;
  statusLabel: string;
  suggestions: AgentInboxSuggestion[];
  threadId: null | number;
  threads: AgentThreadSummary[];
};

export function DashboardSlidePanel({
  disabled,
  messages,
  onArchiveThread,
  onLoadThread,
  onNewThread,
  onResizeStart,
  onRunPrompt,
  onSearchThreads,
  onSelectRun,
  onRunSuggestion,
  pendingAction,
  quickPrompts,
  recentRuns,
  selectedRunId,
  suggestions,
  threadId,
  threads,
}: DashboardSlidePanelProps) {
  const [threadSearch, setThreadSearch] = useState("");
  const [showAllThreads, setShowAllThreads] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback(
    (value: string) => {
      setThreadSearch(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onSearchThreads?.(value);
      }, 300);
    },
    [onSearchThreads],
  );

  const allTasks = buildUnifiedAgentTasks(suggestions, quickPrompts, { quick: 2, suggestions: 3 });
  const conversationSummary = buildConversationSummary(messages, pendingAction);
  const riskTasks = allTasks.filter((task) => task.riskLevel === "high" || task.riskLevel === "medium");
  const visibleThreads = showAllThreads ? threads : threads.slice(0, 8);

  return (
    <aside className="sunny-dashboard-slide-panel sunny-right-context-panel" aria-label="右侧上下文面板">
      {onResizeStart ? (
        <button
          type="button"
          className="sunny-context-panel-resize-handle"
          aria-label="调整右侧面板宽度"
          onPointerDown={onResizeStart}
        />
      ) : null}
      <div className="sunny-dashboard-slide-panel-head">
        <div>
          <p>环境信息</p>
          <h3>当前对话</h3>
          <span className="sunny-dashboard-context-summary-label">对话摘要</span>
          <span className="sunny-dashboard-context-summary">{conversationSummary}</span>
        </div>
        <button
          type="button"
          className="sunny-dashboard-slide-panel-new-btn"
          onClick={onNewThread}
          title="新建会话"
          aria-label="新建会话"
        >
          +
        </button>
      </div>

      {/* Search */}
      <div className="sunny-dashboard-slide-panel-search">
        <input
          type="text"
          value={threadSearch}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="搜索会话..."
          aria-label="搜索会话"
        />
      </div>

      <div className="sunny-dashboard-slide-panel-body">
        {pendingAction ? (
          <SectionGroup title="待处理" count={1}>
            <TaskItem
              badge={threadId ? `#${threadId}` : "未绑定"}
              detail={getPendingActionLabel(pendingAction)}
              label={
                pendingAction.type === "await_confirmation"
                  ? pendingAction.action.summary
                  : pendingAction.type === "await_queue_resume"
                    ? "延迟队列可继续"
                    : "需要继续输入"
              }
              tone={getPendingActionTone(pendingAction)}
            />
          </SectionGroup>
        ) : null}

        <SectionGroup title="建议动作" count={allTasks.length}>
          {allTasks.length > 0 ? (
            allTasks.map((task) => (
              <TaskItem
                key={task.id}
                badge={task.riskLevel ? riskLevelLabelMap[task.riskLevel] : task.source ?? "建议"}
                detail={task.reason}
                disabled={disabled}
                label={task.label}
                onClick={() => {
                  if (task.suggestion) {
                    onRunSuggestion(task.suggestion);
                    return;
                  }
                  onRunPrompt(task.prompt);
                }}
                tone={getRiskTone(task.riskLevel)}
              />
            ))
          ) : (
            <TaskItem detail="输入目标即可开始" label="暂无建议" tone="muted" />
          )}
        </SectionGroup>

        <SectionGroup title="风险提醒" count={riskTasks.length}>
          {riskTasks.length > 0 ? (
            riskTasks.map((task) => (
              <TaskItem
                key={`risk-${task.id}`}
                badge={task.riskLevel ? riskLevelLabelMap[task.riskLevel] : "建议"}
                detail={task.reason}
                disabled={disabled}
                label={task.label}
                onClick={() => {
                  if (task.suggestion) {
                    onRunSuggestion(task.suggestion);
                    return;
                  }
                  onRunPrompt(task.prompt);
                }}
                tone={getRiskTone(task.riskLevel)}
              />
            ))
          ) : (
            <TaskItem detail="当前没有高优先级风险提醒" label="风险稳定" tone="success" />
          )}
        </SectionGroup>

        <SectionGroup title="会话历史" count={threads.length}>
          {visibleThreads.map((thread) => (
            <ThreadItem
              key={thread.id}
              onArchive={onArchiveThread}
              onLoad={onLoadThread}
              selected={thread.id === threadId}
              thread={thread}
            />
          ))}
          {!showAllThreads && threads.length > 8 ? (
            <button
              type="button"
              className="sunny-context-panel-show-all"
              onClick={() => setShowAllThreads(true)}
            >
              显示全部 ({threads.length})
            </button>
          ) : null}
          {threads.length === 0 ? (
            <TaskItem
              detail={threadSearch ? "没有匹配的会话" : "还没有历史会话"}
              label={threadSearch ? "未找到" : "暂无会话"}
              tone="muted"
            />
          ) : null}
        </SectionGroup>

        <SectionGroup title="执行记录" count={recentRuns.length} defaultCollapsed>
          {recentRuns.slice(0, 4).map((run) => (
            <TaskItem
              key={run.id}
              badge={getRunTaskMeta(run)}
              detail={run.impactSummary ?? run.summary ?? run.workflow}
              label={run.title}
              onClick={onSelectRun ? () => onSelectRun(run.id) : undefined}
              selected={run.id === selectedRunId}
              tone={getRunTaskTone(run)}
            />
          ))}
          {recentRuns.length === 0 ? (
            <TaskItem detail="还没有审计记录" label="暂无记录" tone="muted" />
          ) : null}
        </SectionGroup>
      </div>
    </aside>
  );
}
