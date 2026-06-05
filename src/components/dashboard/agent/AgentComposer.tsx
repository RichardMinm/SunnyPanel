import { useState } from "react";
import type { PendingAction } from "@/lib/agent/schemas";

type AgentComposerProps = {
  disabled?: boolean;
  input: string;
  onInputChange: (value: string) => void;
  onStop?: () => void;
  onSubmit: () => void;
  pendingAction: null | PendingAction;
  placeholder: string;
  statusLabel: string;
};

export function AgentComposer({
  disabled,
  input,
  onInputChange,
  onStop,
  onSubmit,
  pendingAction,
  placeholder,
  statusLabel,
}: AgentComposerProps) {
  const [composerMode, setComposerMode] = useState("自动模式");
  const operationState = pendingAction?.type === "await_confirmation"
    ? "等待确认"
    : pendingAction?.type === "await_queue_resume"
      ? "等待继续"
      : pendingAction?.type === "await_learning_followup"
        ? "等待规划"
        : "自动";

  return (
    <form
      className="sunny-agent-composer"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="sunny-agent-composer-top">
        <div className="sunny-agent-composer-modes" aria-label="Agent Composer 模式">
          {["自动模式", "规划模式", "执行模式", "回顾模式"].map((mode) => (
            <button
              key={mode}
              type="button"
              className={mode === composerMode ? "is-active" : ""}
              aria-pressed={mode === composerMode}
              onClick={() => setComposerMode(mode)}
            >
              {mode}
            </button>
          ))}
        </div>
        <span>{statusLabel}</span>
      </div>
      <div className="sunny-agent-composer-tools" aria-label="Agent Composer 快捷操作">
        {["引用上下文", "添加计划", "添加记忆", "添加文件", "斜杠命令"].map((label) => (
          <button key={label} type="button" aria-label={label} title={label}>
            {label}
          </button>
        ))}
        <span className="sunny-agent-auto-mode-pill">{operationState}</span>
      </div>
      <div className="sunny-agent-composer-row">
        <textarea
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          rows={3}
          aria-label={
            pendingAction?.type === "await_confirmation"
              ? "待确认：可输入「确认」或「取消」，或使用上方按钮"
              : pendingAction?.type === "await_queue_resume"
                ? "待继续：可输入「继续」或「取消」"
                : pendingAction?.type === "await_learning_followup"
                  ? `学习咨询上下文：${pendingAction.subject}`
                : "输入要交给 Agent 的话"
          }
          placeholder={
            pendingAction?.type === "await_confirmation"
              ? "回复“确认”执行，或“取消”放弃。"
              : pendingAction?.type === "await_queue_resume"
                ? "回复“继续”恢复延后队列，或“取消”放弃。"
                : pendingAction?.type === "await_learning_followup"
                  ? "可以继续说“拆成学习计划”或“取消”。"
                : placeholder
          }
          className="sunny-agent-composer-input"
        />
        {disabled && onStop ? (
          <button
            type="button"
            onClick={onStop}
            className="sunny-agent-run-button"
            aria-label="停止"
            title="停止"
          >
            <span className="sunny-agent-run-spinner" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={disabled || input.trim().length === 0}
            className="sunny-agent-run-button"
            aria-label={disabled ? "运行中" : "发送"}
            title={disabled ? "运行中" : "发送"}
          >
            {disabled ? <span className="sunny-agent-run-spinner" aria-hidden="true" /> : <span aria-hidden="true">↑</span>}
          </button>
        )}
      </div>
    </form>
  );
}
