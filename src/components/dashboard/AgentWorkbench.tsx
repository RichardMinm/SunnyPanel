"use client";

import Link from "next/link";
import type { RefObject, ReactNode } from "react";

import type { AgentQuickPrompt } from "@/lib/agent/quick-prompts";
import type { AgentInboxSuggestion } from "@/lib/agent/suggestions";
import type {
  AgentChatMessage,
  AgentTokenUsage,
  AgentTraceStep,
  PendingAction,
  PlanProposal,
  ProposedAgentAction,
  ProposedAgentActionChange,
  ScheduleProposal,
} from "@/lib/agent/schemas";

export type AgentThreadSummary = {
  id: number;
  lastInteractionAt?: null | string;
  pendingAction: null | PendingAction;
  title: string;
};

export type AgentRunSummary = {
  id: number;
  startedAt?: null | string;
  status: string;
  summary?: null | string;
  title: string;
  workflow: string;
};

export type AgentWorkbenchMode = "ask" | "execute" | "plan" | "review" | "timeline";
export type AgentWorkbenchTab = "conversation" | "timeline";
export type AgentInspectorTab = "artifacts" | "changes" | "context" | "debug";

type SuggestionAction = {
  id: string;
  label: string;
  prompt: string;
  reason: string;
  riskLevel?: AgentInboxSuggestion["riskLevel"];
  source?: AgentInboxSuggestion["source"];
  suggestion?: AgentInboxSuggestion;
};

const modeItems: Array<{ key: AgentWorkbenchMode; label: string }> = [
  { key: "ask", label: "Ask" },
  { key: "plan", label: "Plan" },
  { key: "execute", label: "Execute" },
  { key: "review", label: "Review" },
  { key: "timeline", label: "Timeline" },
];

const inspectorTabs: Array<{ key: AgentInspectorTab; label: string }> = [
  { key: "context", label: "Context" },
  { key: "changes", label: "Changes" },
  { key: "artifacts", label: "Artifacts" },
  { key: "debug", label: "Debug" },
];

const traceKindLabelMap: Record<AgentTraceStep["kind"], string> = {
  action: "Action",
  analysis: "Reason",
  complete: "Done",
  context: "Context",
  error: "Error",
  write: "Write",
};

const operationLabelMap = {
  create: "创建",
  delete: "删除",
  update: "更新",
} as const;

const riskLevelLabelMap = {
  high: "高风险",
  low: "低风险",
  medium: "中风险",
} as const;

const visibilityLabelMap = {
  private: "私有",
  public: "公开",
  unknown: "未知",
} as const;

const formatTokenCount = (value?: number) =>
  new Intl.NumberFormat("zh-CN").format(Math.max(0, Math.round(value ?? 0)));

const getUsagePercent = (value: number, total: number) => {
  if (total <= 0 || value <= 0) {
    return 0;
  }

  return Math.max(4, Math.round((value / total) * 100));
};

const getPendingActionLabel = (pendingAction: PendingAction) => {
  if (pendingAction.type === "await_completion_note") {
    return `等待补备注：${pendingAction.itemTitle}`;
  }

  if (pendingAction.type === "await_confirmation") {
    return `等待确认：${riskLevelLabelMap[pendingAction.action.riskLevel]}`;
  }

  return `等待澄清：${pendingAction.missingFields.join(" / ") || pendingAction.intent}`;
};

const buildSuggestedTasks = (
  suggestions: AgentInboxSuggestion[],
  quickPrompts: AgentQuickPrompt[],
): SuggestionAction[] => {
  const inboxTasks = suggestions.map((suggestion) => ({
    id: `inbox-${suggestion.id}`,
    label: suggestion.title,
    prompt: suggestion.suggestedPrompt,
    reason: suggestion.reason,
    riskLevel: suggestion.riskLevel,
    source: suggestion.source,
    suggestion,
  }));
  const quickTasks = quickPrompts.map((prompt) => ({
    id: `quick-${prompt.prompt}`,
    label: prompt.label,
    prompt: prompt.prompt,
    reason: prompt.prompt,
  }));

  return [...inboxTasks, ...quickTasks];
};

const getLatestAssistantMessage = (messages: AgentChatMessage[]) =>
  [...messages].reverse().find((message) => message.role === "assistant" && message.content.trim().length > 0);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getPlanProposalFromAction = (action: ProposedAgentAction): null | PlanProposal => {
  if (action.intent !== "compose_plan") {
    return null;
  }

  const snapshotProposal = isRecord(action.afterSnapshot) && isRecord(action.afterSnapshot.proposal)
    ? action.afterSnapshot.proposal
    : null;
  const argsProposal = isRecord(action.args) && isRecord(action.args.proposal) ? action.args.proposal : null;
  const proposal = snapshotProposal ?? argsProposal;

  return proposal as null | PlanProposal;
};

const getScheduleProposalFromAction = (action: ProposedAgentAction): null | ScheduleProposal => {
  if (action.intent !== "compose_schedule_item") {
    return null;
  }

  const snapshot = isRecord(action.afterSnapshot) ? action.afterSnapshot : null;
  const argsProposal = isRecord(action.args) && isRecord(action.args.proposal) ? action.args.proposal : null;
  const proposal = argsProposal ?? snapshot;

  return proposal as null | ScheduleProposal;
};

type AgentWorkbenchLayoutProps = {
  center: ReactNode;
  inspector: ReactNode;
  sidebar: ReactNode;
};

export function AgentWorkbenchLayout({ center, inspector, sidebar }: AgentWorkbenchLayoutProps) {
  return (
    <section className="sunny-agent-workbench-layout">
      {sidebar}
      <main className="sunny-agent-center-surface">{center}</main>
      {inspector}
    </section>
  );
}

type AgentTaskRowProps = {
  detail?: null | string;
  disabled?: boolean;
  label: string;
  meta?: null | string;
  onClick?: () => void;
  selected?: boolean;
  tone?: "accent" | "danger" | "info" | "muted" | "success" | "warning";
};

export function AgentTaskRow({
  detail,
  disabled,
  label,
  meta,
  onClick,
  selected,
  tone = "muted",
}: AgentTaskRowProps) {
  return (
    <button
      type="button"
      disabled={disabled || !onClick}
      onClick={onClick}
      className={`sunny-agent-task-row sunny-agent-task-row-${tone} ${selected ? "sunny-agent-task-row-selected" : ""}`}
    >
      <span className="sunny-agent-task-row-dot" aria-hidden="true" />
      <span className="sunny-agent-task-row-copy">
        <strong>{label}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
      {meta ? <span className="sunny-agent-task-row-meta">{meta}</span> : null}
    </button>
  );
}

type AgentSidebarProps = {
  disabled?: boolean;
  inboxSuggestions: AgentInboxSuggestion[];
  isThinking: boolean;
  onLoadThread: (threadId: number) => void;
  onNewThread: () => void;
  onRunPrompt: (prompt: string) => void;
  onRunSuggestion: (suggestion: AgentInboxSuggestion) => void;
  pendingAction: null | PendingAction;
  quickPrompts: AgentQuickPrompt[];
  recentRuns: AgentRunSummary[];
  statusLabel: string;
  threadId: null | number;
  threads: AgentThreadSummary[];
};

export function AgentSidebar({
  disabled,
  inboxSuggestions,
  isThinking,
  onLoadThread,
  onNewThread,
  onRunPrompt,
  onRunSuggestion,
  pendingAction,
  quickPrompts,
  recentRuns,
  statusLabel,
  threadId,
  threads,
}: AgentSidebarProps) {
  const tasks = buildSuggestedTasks(inboxSuggestions, quickPrompts).slice(0, 5);
  const pendingTone = pendingAction?.type === "await_confirmation"
    ? pendingAction.action.riskLevel === "high"
      ? "danger"
      : pendingAction.action.riskLevel === "medium"
        ? "warning"
        : "success"
    : "warning";

  return (
    <aside className="sunny-agent-left-rail">
      <div className="sunny-agent-rail-head">
        <button type="button" onClick={onNewThread} className="sunny-agent-new-task-button">
          New Task
        </button>
      </div>

      <div className="sunny-agent-rail-section">
        <p className="sunny-agent-rail-label">Active</p>
        <AgentTaskRow
          detail={isThinking ? "running" : "ready"}
          label={statusLabel}
          meta={threadId ? `#${threadId}` : null}
          tone={isThinking ? "info" : "success"}
        />
      </div>

      <div className="sunny-agent-rail-section">
        <p className="sunny-agent-rail-label">Approvals</p>
        {pendingAction ? (
          <AgentTaskRow
            detail={getPendingActionLabel(pendingAction)}
            label={pendingAction.type === "await_confirmation" ? pendingAction.action.summary : "需要继续输入"}
            meta="待处理"
            tone={pendingTone}
          />
        ) : (
          <AgentTaskRow detail="没有待确认动作" label="Clear" tone="muted" />
        )}
      </div>

      <div className="sunny-agent-rail-section">
        <p className="sunny-agent-rail-label">Suggestions</p>
        {tasks.length > 0 ? (
          tasks.map((task) => (
            <AgentTaskRow
              key={task.id}
              disabled={disabled}
              detail={task.reason}
              label={task.label}
              meta={task.riskLevel ? riskLevelLabelMap[task.riskLevel] : task.source ?? "Run"}
              onClick={() => {
                if (task.suggestion) {
                  onRunSuggestion(task.suggestion);
                  return;
                }

                onRunPrompt(task.prompt);
              }}
              tone={task.riskLevel === "high" ? "danger" : task.riskLevel === "medium" ? "warning" : "accent"}
            />
          ))
        ) : (
          <AgentTaskRow detail="输入一个目标即可开始" label="暂无建议" tone="muted" />
        )}
      </div>

      <details className="sunny-agent-rail-section sunny-agent-rail-details">
        <summary>Threads</summary>
        <div className="sunny-agent-rail-detail-list">
          {threads.slice(0, 5).map((thread) => (
            <AgentTaskRow
              key={thread.id}
              detail={thread.pendingAction ? getPendingActionLabel(thread.pendingAction) : thread.title}
              label={`Thread #${thread.id}`}
              onClick={() => onLoadThread(thread.id)}
              selected={thread.id === threadId}
              tone={thread.pendingAction ? "warning" : "muted"}
            />
          ))}
          {threads.length === 0 ? <AgentTaskRow detail="还没有历史会话" label="No threads" tone="muted" /> : null}
        </div>
      </details>

      <details className="sunny-agent-rail-section sunny-agent-rail-details">
        <summary>Recent AgentRuns</summary>
        <div className="sunny-agent-rail-detail-list">
          {recentRuns.slice(0, 4).map((run) => (
            <AgentTaskRow
              key={run.id}
              detail={run.summary ?? run.workflow}
              label={run.title}
              meta={run.status}
              tone={run.status === "failed" ? "danger" : run.status === "succeeded" ? "success" : "info"}
            />
          ))}
          {recentRuns.length === 0 ? <AgentTaskRow detail="还没有审计记录" label="No runs" tone="muted" /> : null}
        </div>
      </details>
    </aside>
  );
}

type AgentModeSwitchProps = {
  mode: AgentWorkbenchMode;
  onModeChange: (mode: AgentWorkbenchMode) => void;
};

function AgentModeSwitch({ mode, onModeChange }: AgentModeSwitchProps) {
  return (
    <div className="sunny-agent-mode-switch-v2" role="tablist" aria-label="Agent mode">
      {modeItems.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onModeChange(item.key)}
          className={item.key === mode ? "active" : ""}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

type AgentComposerProps = {
  disabled?: boolean;
  input: string;
  mode: AgentWorkbenchMode;
  onInputChange: (value: string) => void;
  onModeChange: (mode: AgentWorkbenchMode) => void;
  onSubmit: () => void;
  pendingAction: null | PendingAction;
  placeholder: string;
  statusLabel: string;
};

export function AgentComposer({
  disabled,
  input,
  mode,
  onInputChange,
  onModeChange,
  onSubmit,
  pendingAction,
  placeholder,
  statusLabel,
}: AgentComposerProps) {
  return (
    <form
      className="sunny-agent-composer"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="sunny-agent-composer-top">
        <AgentModeSwitch mode={mode} onModeChange={onModeChange} />
        <span>{statusLabel}</span>
      </div>
      <div className="sunny-agent-composer-row">
        <textarea
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          rows={3}
          placeholder={pendingAction?.type === "await_confirmation" ? "回复“确认”执行，或“取消”放弃。" : placeholder}
          className="sunny-agent-composer-input"
        />
        <button
          type="submit"
          disabled={disabled || input.trim().length === 0}
          className="sunny-agent-run-button disabled:cursor-not-allowed disabled:opacity-60"
        >
          {disabled ? "Running" : "Run"}
        </button>
      </div>
    </form>
  );
}

type AgentApprovalBannerProps = {
  action: null | ProposedAgentAction;
  disabled?: boolean;
  onCancel: () => void;
  onEdit?: (kind: "plan" | "schedule" | "generic") => void;
  onConfirm: () => void;
};

export function AgentApprovalBanner({ action, disabled, onCancel, onConfirm, onEdit }: AgentApprovalBannerProps) {
  if (!action) {
    return null;
  }

  const firstChange = action.changes[0];
  const planProposal = getPlanProposalFromAction(action);
  const scheduleProposal = getScheduleProposalFromAction(action);
  const confirmLabel = planProposal ? "Confirm create" : scheduleProposal ? "Confirm schedule" : "确认执行";
  const editLabel = scheduleProposal ? "Change time" : planProposal ? "Edit request" : "调整请求";

  return (
    <section className={`sunny-agent-approval-banner sunny-agent-approval-banner-${action.riskLevel}`}>
      <div className="sunny-agent-approval-banner-main">
        <div>
          <p>Pending Approval</p>
          <h3>{action.summary}</h3>
        </div>
        <span>{riskLevelLabelMap[action.riskLevel]}</span>
      </div>
      <div className="sunny-agent-approval-banner-meta">
        <span>{action.toolName ?? action.intent}</span>
        <span>{firstChange ? operationLabelMap[firstChange.operation] : "待确认"}</span>
        <span>{firstChange ? `${firstChange.collection}${firstChange.documentId ? ` #${firstChange.documentId}` : ""}` : "未解析"}</span>
        <span>{firstChange?.visibility ? visibilityLabelMap[firstChange.visibility] : "未知可见性"}</span>
      </div>
      {planProposal ? (
        <div className="sunny-agent-proposal-card sunny-agent-plan-proposal">
          <div>
            <span>Plan title</span>
            <strong>{planProposal.title}</strong>
          </div>
          <p>{planProposal.goal}</p>
          {planProposal.motivation ? <p>{planProposal.motivation}</p> : null}
          <div className="sunny-agent-proposal-grid">
            <div>
              <span>Scope</span>
              <p>{planProposal.scope || "未指定"}</p>
            </div>
            <div>
              <span>Priority</span>
              <p>{planProposal.suggestedPriority}</p>
            </div>
            <div>
              <span>Due</span>
              <p>{planProposal.suggestedDueDate || "未设定"}</p>
            </div>
          </div>
          <div className="sunny-agent-proposal-columns">
            <div>
              <span>Key steps</span>
              <ul>
                {planProposal.keySteps.slice(0, 5).map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <div>
              <span>Success criteria</span>
              <ul>
                {planProposal.successCriteria.slice(0, 4).map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          </div>
          {planProposal.risks.length > 0 ? (
            <div className="sunny-agent-proposal-warning">
              <span>Risks</span>
              <p>{planProposal.risks.slice(0, 3).join("；")}</p>
            </div>
          ) : null}
          <div className="sunny-agent-proposal-brief">
            <span>Agent Brief</span>
            <p>{planProposal.agentBrief}</p>
          </div>
        </div>
      ) : scheduleProposal ? (
        <div className="sunny-agent-proposal-card sunny-agent-schedule-proposal">
          <div>
            <span>Schedule title</span>
            <strong>{scheduleProposal.title}</strong>
          </div>
          <div className="sunny-agent-proposal-grid">
            <div>
              <span>Date</span>
              <p>{scheduleProposal.date}</p>
            </div>
            <div>
              <span>Time</span>
              <p>{scheduleProposal.isAllDay ? "全天" : `${scheduleProposal.startTime ?? "未定"}-${scheduleProposal.endTime ?? "未定"}`}</p>
            </div>
            <div>
              <span>Priority</span>
              <p>{scheduleProposal.priority}</p>
            </div>
          </div>
          <p>{scheduleProposal.reason}</p>
          <div className="sunny-agent-proposal-grid">
            <div>
              <span>Related Plan</span>
              <p>{scheduleProposal.relatedPlanId ? `#${scheduleProposal.relatedPlanId}` : "未关联"}</p>
            </div>
            <div>
              <span>Related Checklist</span>
              <p>{scheduleProposal.relatedChecklistId ? `#${scheduleProposal.relatedChecklistId}` : "未关联"}</p>
            </div>
          </div>
          {scheduleProposal.conflicts.length > 0 ? (
            <div className="sunny-agent-proposal-warning">
              <span>Conflict warning</span>
              <ul>
                {scheduleProposal.conflicts.map((conflict) => (
                  <li key={conflict.scheduleItemId}>
                    {conflict.title} {conflict.startTime && conflict.endTime ? `(${conflict.startTime}-${conflict.endTime})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="sunny-agent-proposal-brief">
              <span>Conflict check</span>
              <p>没有检测到同时间段冲突。</p>
            </div>
          )}
        </div>
      ) : (
        <p className="sunny-agent-approval-banner-preview">{firstChange?.preview ?? "确认前请检查右侧 Changes。"}</p>
      )}
      <div className="sunny-agent-approval-banner-actions">
        <button type="button" disabled={disabled} onClick={onConfirm} className="sunny-agent-confirm-button disabled:cursor-not-allowed disabled:opacity-60">
          {confirmLabel}
        </button>
        {onEdit ? (
          <button type="button" disabled={disabled} onClick={() => onEdit(planProposal ? "plan" : scheduleProposal ? "schedule" : "generic")} className="sunny-agent-edit-button disabled:cursor-not-allowed disabled:opacity-60">
            {editLabel}
          </button>
        ) : null}
        <button type="button" disabled={disabled} onClick={onCancel} className="sunny-agent-cancel-button-v2 disabled:cursor-not-allowed disabled:opacity-60">
          取消
        </button>
      </div>
    </section>
  );
}

type AgentRunTabsProps = {
  activeTab: AgentWorkbenchTab;
  onActiveTabChange: (tab: AgentWorkbenchTab) => void;
};

export function AgentRunTabs({ activeTab, onActiveTabChange }: AgentRunTabsProps) {
  return (
    <div className="sunny-agent-run-tabs" role="tablist" aria-label="Agent run view">
      <button type="button" className={activeTab === "timeline" ? "active" : ""} onClick={() => onActiveTabChange("timeline")}>
        Run
      </button>
      <button type="button" className={activeTab === "conversation" ? "active" : ""} onClick={() => onActiveTabChange("conversation")}>
        Conversation
      </button>
    </div>
  );
}

type AgentToolCallCardProps = {
  step: AgentTraceStep;
};

function AgentToolCallCard({ step }: AgentToolCallCardProps) {
  if (step.kind !== "action" && step.kind !== "write") {
    return null;
  }

  return (
    <div className="sunny-agent-tool-call-card-v2">
      <span>{step.kind === "write" ? "write_tool" : "agent_action"}</span>
      <strong>{step.title}</strong>
    </div>
  );
}

type AgentRunTimelineProps = {
  isThinking: boolean;
  latestAssistantMessage?: AgentChatMessage;
  statusLabel: string;
  steps: AgentTraceStep[];
};

export function AgentRunTimeline({ isThinking, latestAssistantMessage, statusLabel, steps }: AgentRunTimelineProps) {
  const runningIndex = steps.findIndex((step) => step.status === "running");
  const emptyTitle = isThinking ? "正在建立请求" : "等待新任务";
  const emptyDescription = isThinking
    ? "服务端 trace 返回后，这里会展开上下文、工具调用和写入过程。"
    : "默认只显示执行过程。完整对话放在 Conversation 里。";
  const summaryContent = !isThinking ? latestAssistantMessage?.content.trim() : "";

  return (
    <section className="sunny-agent-run-surface">
      <div className="sunny-agent-run-surface-head">
        <div>
          <p>Run Timeline</p>
          <h2>执行过程</h2>
        </div>
        <span className={`sunny-agent-live-pill-v2 ${isThinking ? "active" : ""}`}>
          <i aria-hidden="true" />
          {statusLabel}
        </span>
      </div>

      {summaryContent ? (
        <div className="sunny-agent-run-summary">
          <span>Summary</span>
          <p>{summaryContent}</p>
        </div>
      ) : null}

      <div className="sunny-agent-run-list-v2">
        {steps.length > 0 ? (
          steps.map((step, index) => (
            <div
              key={step.id}
              className={`sunny-agent-run-step-v2 sunny-agent-run-step-v2-${step.status} ${
                index === runningIndex || (runningIndex === -1 && index === steps.length - 1) ? "active" : ""
              }`}
            >
              <span className="sunny-agent-run-step-marker" aria-hidden="true" />
              <div className="sunny-agent-run-step-content">
                <div>
                  <span className={`sunny-agent-kind-pill sunny-agent-kind-${step.kind}`}>{traceKindLabelMap[step.kind]}</span>
                  <small>{step.status}</small>
                </div>
                <h3>{step.title}</h3>
                {step.detail ? <p>{step.detail}</p> : null}
                <AgentToolCallCard step={step} />
              </div>
            </div>
          ))
        ) : (
          <div className="sunny-agent-run-empty-v2">
            <span className={isThinking ? "live" : ""} aria-hidden="true" />
            <div>
              <h3>{emptyTitle}</h3>
              <p>{emptyDescription}</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

type AgentConversationProps = {
  errorMessage: null | string;
  isSubmitting: boolean;
  messages: AgentChatMessage[];
  transcriptRef: RefObject<HTMLDivElement | null>;
};

export function AgentConversation({ errorMessage, isSubmitting, messages, transcriptRef }: AgentConversationProps) {
  return (
    <section className="sunny-agent-conversation-surface">
      <div className="sunny-agent-run-surface-head">
        <div>
          <p>Conversation</p>
          <h2>对话记录</h2>
        </div>
        <span>{isSubmitting ? "Streaming" : "Ready"}</span>
      </div>
      <div ref={transcriptRef} className="sunny-agent-conversation-scroll">
        {messages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={`sunny-agent-message-row sunny-agent-message-row-${message.role}`}>
            <span>{message.role === "assistant" ? "Agent" : "You"}</span>
            <p>{message.content || (isSubmitting && index === messages.length - 1 ? "正在生成回复..." : "")}</p>
          </div>
        ))}
      </div>
      {errorMessage ? <div className="sunny-agent-error-card-v2">{errorMessage}</div> : null}
    </section>
  );
}

type AgentChangeCardProps = {
  change: ProposedAgentActionChange;
};

function AgentChangeCard({ change }: AgentChangeCardProps) {
  return (
    <div className={`sunny-agent-change-row sunny-agent-change-row-${change.operation}`}>
      <div>
        <span>{operationLabelMap[change.operation]}</span>
        <strong>{change.documentId ? `${change.collection} #${change.documentId}` : change.collection}</strong>
      </div>
      <p>{change.preview}</p>
      {change.beforePreview || change.afterPreview ? (
        <div className="sunny-agent-diff-inline">
          {change.beforePreview ? <del>{change.beforePreview}</del> : null}
          {change.afterPreview ? <ins>{change.afterPreview}</ins> : null}
        </div>
      ) : null}
      <small>
        {change.visibility ? visibilityLabelMap[change.visibility] : "未知可见性"}
        {change.timelineAffected ? " · 影响 Timeline" : ""}
      </small>
    </div>
  );
}

type AgentChangesPanelProps = {
  action: null | ProposedAgentAction;
};

export function AgentChangesPanel({ action }: AgentChangesPanelProps) {
  if (!action) {
    return (
      <div className="sunny-agent-inspector-empty">
        <h3>暂无待审变更</h3>
        <p>需要写入计划、清单或 Timeline 时，dry-run 结果会出现在这里。</p>
      </div>
    );
  }

  return (
    <div className="sunny-agent-inspector-panel">
      <div className="sunny-agent-inspector-summary">
        <span className={`sunny-agent-risk-pill-v2 sunny-agent-risk-${action.riskLevel}`}>{riskLevelLabelMap[action.riskLevel]}</span>
        <h3>{action.summary}</h3>
        <p>{action.toolName ?? action.intent}</p>
      </div>
      <div className="sunny-agent-change-list-v2">
        {action.changes.map((change, index) => (
          <AgentChangeCard key={`${change.collection}-${change.operation}-${index}`} change={change} />
        ))}
      </div>
    </div>
  );
}

type AgentContextPanelProps = {
  messages: AgentChatMessage[];
  pendingAction: null | PendingAction;
  statusLabel: string;
  threadId: null | number;
  traceSteps: AgentTraceStep[];
};

export function AgentContextPanel({ messages, pendingAction, statusLabel, threadId, traceSteps }: AgentContextPanelProps) {
  const contextSteps = traceSteps.filter((step) => step.kind === "context");

  return (
    <div className="sunny-agent-inspector-panel">
      <div className="sunny-agent-context-grid-v2">
        <span>Thread</span>
        <strong>{threadId ? `#${threadId}` : "新任务"}</strong>
        <span>Messages</span>
        <strong>{messages.length}</strong>
        <span>Status</span>
        <strong>{statusLabel}</strong>
        <span>Pending</span>
        <strong>{pendingAction ? getPendingActionLabel(pendingAction) : "无"}</strong>
      </div>
      <div className="sunny-agent-context-notes-v2">
        {contextSteps.length > 0 ? (
          contextSteps.map((step) => <p key={step.id}>{step.detail ?? step.title}</p>)
        ) : (
          <p>发送任务后，Agent 读取的计划、内容、Timeline 和 AgentRun 摘要会在这里出现。</p>
        )}
      </div>
    </div>
  );
}

type AgentArtifactsPanelProps = {
  action: null | ProposedAgentAction;
  latestAssistantMessage?: AgentChatMessage;
};

export function AgentArtifactsPanel({ action, latestAssistantMessage }: AgentArtifactsPanelProps) {
  if (!action && !latestAssistantMessage) {
    return (
      <div className="sunny-agent-inspector-empty">
        <h3>暂无产物</h3>
        <p>Agent 的总结、Timeline 提案和写入结果会在完成后沉淀到这里。</p>
      </div>
    );
  }

  return (
    <div className="sunny-agent-inspector-panel">
      {action ? (
        <div className="sunny-agent-artifact-row">
          <span>{action.intent}</span>
          <strong>{action.summary}</strong>
          <p>{action.changes[0]?.preview ?? "等待确认后执行。"}</p>
        </div>
      ) : null}
      {latestAssistantMessage ? (
        <div className="sunny-agent-artifact-row">
          <span>assistant_response</span>
          <strong>最近结果</strong>
          <p>{latestAssistantMessage.content}</p>
        </div>
      ) : null}
    </div>
  );
}

type AgentDebugPanelProps = {
  inputTokenEstimate: number;
  tokenUsage: AgentTokenUsage;
  traceSteps: AgentTraceStep[];
};

export function AgentDebugPanel({ inputTokenEstimate, tokenUsage, traceSteps }: AgentDebugPanelProps) {
  const usageTotal = Math.max(tokenUsage.totalTokens, 1);

  return (
    <div className="sunny-agent-inspector-panel">
      <div className="sunny-agent-debug-grid-v2">
        <span>Input</span>
        <strong>{formatTokenCount(inputTokenEstimate)}</strong>
        <span>Context</span>
        <strong>{formatTokenCount(tokenUsage.contextTokens)}</strong>
        <span>Output</span>
        <strong>{formatTokenCount(tokenUsage.outputTokens)}</strong>
        <span>Total</span>
        <strong>{formatTokenCount(tokenUsage.totalTokens)}</strong>
        <span>Trace</span>
        <strong>{traceSteps.length}</strong>
      </div>
      <div className="sunny-agent-debug-bars" aria-hidden="true">
        <span style={{ width: `${getUsagePercent(tokenUsage.contextTokens, usageTotal)}%` }} />
        <span style={{ width: `${getUsagePercent(tokenUsage.inputTokens, usageTotal)}%` }} />
        <span style={{ width: `${getUsagePercent(tokenUsage.outputTokens, usageTotal)}%` }} />
      </div>
      <p className="sunny-agent-debug-source-v2">{tokenUsage.source === "provider" ? "Provider usage" : "Local estimate"}</p>
    </div>
  );
}

type AgentInspectorTabsProps = {
  activeTab: AgentInspectorTab;
  onActiveTabChange: (tab: AgentInspectorTab) => void;
};

export function AgentInspectorTabs({ activeTab, onActiveTabChange }: AgentInspectorTabsProps) {
  return (
    <div className="sunny-agent-inspector-tabs" role="tablist" aria-label="Agent inspector">
      {inspectorTabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={activeTab === tab.key ? "active" : ""}
          onClick={() => onActiveTabChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

type AgentInspectorProps = {
  action: null | ProposedAgentAction;
  activeTab: AgentInspectorTab;
  inputTokenEstimate: number;
  latestAssistantMessage?: AgentChatMessage;
  messages: AgentChatMessage[];
  onActiveTabChange: (tab: AgentInspectorTab) => void;
  pendingAction: null | PendingAction;
  statusLabel: string;
  threadId: null | number;
  tokenUsage: AgentTokenUsage;
  traceSteps: AgentTraceStep[];
};

export function AgentInspector({
  action,
  activeTab,
  inputTokenEstimate,
  latestAssistantMessage,
  messages,
  onActiveTabChange,
  pendingAction,
  statusLabel,
  threadId,
  tokenUsage,
  traceSteps,
}: AgentInspectorProps) {
  return (
    <aside className="sunny-agent-inspector-shell">
      <div className="sunny-agent-inspector-head">
        <div>
          <p>Inspector</p>
          <h2>{inspectorTabs.find((tab) => tab.key === activeTab)?.label ?? "Context"}</h2>
        </div>
      </div>
      <AgentInspectorTabs activeTab={activeTab} onActiveTabChange={onActiveTabChange} />
      {activeTab === "context" ? (
        <AgentContextPanel
          messages={messages}
          pendingAction={pendingAction}
          statusLabel={statusLabel}
          threadId={threadId}
          traceSteps={traceSteps}
        />
      ) : null}
      {activeTab === "changes" ? <AgentChangesPanel action={action} /> : null}
      {activeTab === "artifacts" ? <AgentArtifactsPanel action={action} latestAssistantMessage={latestAssistantMessage} /> : null}
      {activeTab === "debug" ? (
        <AgentDebugPanel inputTokenEstimate={inputTokenEstimate} tokenUsage={tokenUsage} traceSteps={traceSteps} />
      ) : null}
    </aside>
  );
}

type AgentWorkbenchProps = {
  activeInspectorTab: AgentInspectorTab;
  activeTab: AgentWorkbenchTab;
  errorMessage: null | string;
  inboxSuggestions: AgentInboxSuggestion[];
  input: string;
  inputTokenEstimate: number;
  isSubmitting: boolean;
  isThinking: boolean;
  messages: AgentChatMessage[];
  mode: AgentWorkbenchMode;
  onActiveInspectorTabChange: (tab: AgentInspectorTab) => void;
  onActiveTabChange: (tab: AgentWorkbenchTab) => void;
  onCancelApproval: () => void;
  onEditApproval: (kind: "plan" | "schedule" | "generic") => void;
  onConfirmApproval: () => void;
  onInputChange: (value: string) => void;
  onLoadThread: (threadId: number) => void;
  onModeChange: (mode: AgentWorkbenchMode) => void;
  onNewThread: () => void;
  onRunPrompt: (prompt: string) => void;
  onRunSuggestion: (suggestion: AgentInboxSuggestion) => void;
  onSubmit: () => void;
  pendingAction: null | PendingAction;
  quickPrompts: AgentQuickPrompt[];
  recentRuns: AgentRunSummary[];
  statusLabel: string;
  threadId: null | number;
  threads: AgentThreadSummary[];
  tokenUsage: AgentTokenUsage;
  traceSteps: AgentTraceStep[];
  transcriptRef: RefObject<HTMLDivElement | null>;
};

export function AgentWorkbench({
  activeInspectorTab,
  activeTab,
  errorMessage,
  inboxSuggestions,
  input,
  inputTokenEstimate,
  isSubmitting,
  isThinking,
  messages,
  mode,
  onActiveInspectorTabChange,
  onActiveTabChange,
  onCancelApproval,
  onEditApproval,
  onConfirmApproval,
  onInputChange,
  onLoadThread,
  onModeChange,
  onNewThread,
  onRunPrompt,
  onRunSuggestion,
  onSubmit,
  pendingAction,
  quickPrompts,
  recentRuns,
  statusLabel,
  threadId,
  threads,
  tokenUsage,
  traceSteps,
  transcriptRef,
}: AgentWorkbenchProps) {
  const confirmationAction = pendingAction?.type === "await_confirmation" ? pendingAction.action : null;
  const latestAssistantMessage = getLatestAssistantMessage(messages);
  const suggestedPlaceholder = quickPrompts[0]?.prompt ?? "整理今天最应该推进的一个动作";
  const center = (
    <>
      <AgentComposer
        disabled={isSubmitting}
        input={input}
        mode={mode}
        onInputChange={onInputChange}
        onModeChange={onModeChange}
        onSubmit={onSubmit}
        pendingAction={pendingAction}
        placeholder={`例如：${suggestedPlaceholder}`}
        statusLabel={statusLabel}
      />
      <AgentApprovalBanner
        action={confirmationAction}
        disabled={isSubmitting}
        onCancel={onCancelApproval}
        onConfirm={onConfirmApproval}
        onEdit={onEditApproval}
      />
      <AgentRunTabs activeTab={activeTab} onActiveTabChange={onActiveTabChange} />
      {activeTab === "timeline" ? (
        <AgentRunTimeline
          isThinking={isThinking}
          latestAssistantMessage={latestAssistantMessage}
          statusLabel={statusLabel}
          steps={traceSteps}
        />
      ) : (
        <AgentConversation
          errorMessage={errorMessage}
          isSubmitting={isSubmitting}
          messages={messages}
          transcriptRef={transcriptRef}
        />
      )}
    </>
  );
  const sidebar = (
    <AgentSidebar
      disabled={isSubmitting}
      inboxSuggestions={inboxSuggestions}
      isThinking={isThinking}
      onLoadThread={onLoadThread}
      onNewThread={onNewThread}
      onRunPrompt={onRunPrompt}
      onRunSuggestion={onRunSuggestion}
      pendingAction={pendingAction}
      quickPrompts={quickPrompts}
      recentRuns={recentRuns}
      statusLabel={statusLabel}
      threadId={threadId}
      threads={threads}
    />
  );
  const inspector = (
    <AgentInspector
      action={confirmationAction}
      activeTab={activeInspectorTab}
      inputTokenEstimate={inputTokenEstimate}
      latestAssistantMessage={latestAssistantMessage}
      messages={messages}
      onActiveTabChange={onActiveInspectorTabChange}
      pendingAction={pendingAction}
      statusLabel={statusLabel}
      threadId={threadId}
      tokenUsage={tokenUsage}
      traceSteps={traceSteps}
    />
  );

  return <AgentWorkbenchLayout center={center} inspector={inspector} sidebar={sidebar} />;
}

type AgentDockProps = {
  errorMessage: null | string;
  fullConsoleHref: string;
  inboxSuggestions: AgentInboxSuggestion[];
  input: string;
  isSubmitting: boolean;
  isThinking: boolean;
  messages: AgentChatMessage[];
  onCancelApproval: () => void;
  onEditApproval: (kind: "plan" | "schedule" | "generic") => void;
  onConfirmApproval: () => void;
  onInputChange: (value: string) => void;
  onRunPrompt: (prompt: string) => void;
  onRunSuggestion: (suggestion: AgentInboxSuggestion) => void;
  onSubmit: () => void;
  pendingAction: null | PendingAction;
  quickPrompts: AgentQuickPrompt[];
  statusLabel: string;
  threadId: null | number;
};

export function AgentDock({
  errorMessage,
  fullConsoleHref,
  inboxSuggestions,
  input,
  isSubmitting,
  isThinking,
  messages,
  onCancelApproval,
  onEditApproval,
  onConfirmApproval,
  onInputChange,
  onRunPrompt,
  onRunSuggestion,
  onSubmit,
  pendingAction,
  quickPrompts,
  statusLabel,
  threadId,
}: AgentDockProps) {
  const confirmationAction = pendingAction?.type === "await_confirmation" ? pendingAction.action : null;
  const latestAssistantMessage = getLatestAssistantMessage(messages);
  const tasks = buildSuggestedTasks(inboxSuggestions, quickPrompts).slice(0, 3);

  return (
    <section className="sunny-agent-dock-v2">
      <div className="sunny-agent-dock-v2-head">
        <div>
          <p>Agent Dock</p>
          <h2>工作助手</h2>
        </div>
        <Link href={fullConsoleHref}>工作台</Link>
      </div>

      <div className="sunny-agent-dock-v2-status">
        <span className={isThinking ? "active" : ""} aria-hidden="true" />
        <strong>{statusLabel}</strong>
        {threadId ? <small>Thread #{threadId}</small> : null}
      </div>

      <AgentApprovalBanner
        action={confirmationAction}
        disabled={isSubmitting}
        onCancel={onCancelApproval}
        onConfirm={onConfirmApproval}
        onEdit={onEditApproval}
      />

      {!confirmationAction && pendingAction ? <div className="sunny-agent-dock-v2-pending">{getPendingActionLabel(pendingAction)}</div> : null}

      <div className="sunny-agent-dock-v2-tasks">
        <p>Suggested Tasks</p>
        {tasks.map((task) => (
          <AgentTaskRow
            key={task.id}
            disabled={isSubmitting}
            detail={task.reason}
            label={task.label}
            onClick={() => {
              if (task.suggestion) {
                onRunSuggestion(task.suggestion);
                return;
              }

              onRunPrompt(task.prompt);
            }}
            tone={task.riskLevel === "high" ? "danger" : task.riskLevel === "medium" ? "warning" : "accent"}
          />
        ))}
      </div>

      <form
        className="sunny-agent-dock-v2-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <textarea
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          rows={3}
          placeholder={confirmationAction ? "回复“确认”或“取消”" : "想推进什么？"}
        />
        <button type="submit" disabled={isSubmitting || input.trim().length === 0}>
          {isSubmitting ? "运行中" : "发送"}
        </button>
      </form>

      {latestAssistantMessage ? (
        <div className="sunny-agent-dock-v2-latest">
          <span>Latest</span>
          <p>{latestAssistantMessage.content}</p>
        </div>
      ) : null}

      {errorMessage ? <div className="sunny-agent-error-card-v2">{errorMessage}</div> : null}
    </section>
  );
}
