import Link from "next/link";

import type { AgentQuickPrompt } from "@/lib/agent/quick-prompts";
import type { AgentInboxSuggestion } from "@/lib/agent/suggestions";
import type { AgentChatMessage, PendingAction } from "@/lib/agent/schemas";

import { AgentApprovalCard } from "./AgentApprovalCard";
import { AgentMarkdownBubble } from "./AgentMarkdownBubble";
import { AgentTaskRow } from "./AgentTaskRow";
import { buildSuggestedTasks, getLatestAssistantMessage, getPendingActionLabel } from "./utils";

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
    <section className="sunny-agent-dock-v2" data-testid="agent-dock">
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

      <AgentApprovalCard
        action={confirmationAction}
        disabled={isSubmitting}
        onCancel={onCancelApproval}
        onConfirm={onConfirmApproval}
        onEdit={onEditApproval}
      />

      {!confirmationAction && pendingAction ? <div className="sunny-agent-dock-v2-pending">{getPendingActionLabel(pendingAction)}</div> : null}

      <div className="sunny-agent-dock-v2-tasks" role="list">
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
          aria-label={confirmationAction ? "\u5f85\u786e\u8ba4\uff1a\u8f93\u5165\u786e\u8ba4\u6216\u53d6\u6d88" : "\u8f93\u5165\u8981\u4ea4\u7ed9 Agent \u5904\u7406\u7684\u5185\u5bb9"}
          placeholder={confirmationAction ? "\u56de\u590d\u201c\u786e\u8ba4\u201d\u6216\u201c\u53d6\u6d88\u201d" : "\u60f3\u63a8\u8fdb\u4ec0\u4e48\uff1f"}
        />
        <button type="submit" disabled={isSubmitting || input.trim().length === 0}>
          {isSubmitting ? "\u8fd0\u884c\u4e2d" : "\u53d1\u9001"}
        </button>
      </form>

      {latestAssistantMessage ? (
        <div className="sunny-agent-dock-v2-latest">
          <span>Latest</span>
          <AgentMarkdownBubble content={latestAssistantMessage.content} />
        </div>
      ) : null}

      {errorMessage ? <div className="sunny-agent-error-card-v2" role="alert">{errorMessage}</div> : null}
    </section>
  );
}
