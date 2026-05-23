import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import type { PendingAction } from "@/lib/agent/schemas";

import { modeItems } from "./constants";
import type { AgentWorkbenchMode } from "./types";

type AgentModeSwitchProps = {
  mode: AgentWorkbenchMode;
  onModeChange: (mode: AgentWorkbenchMode) => void;
  suggestedMode?: AgentWorkbenchMode | null;
};

function AgentModeSwitch({ mode, onModeChange, suggestedMode }: AgentModeSwitchProps) {
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const currentIndex = modeItems.findIndex((item) => item.key === mode);

    if (currentIndex < 0) return;

    let nextIndex = currentIndex;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % modeItems.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + modeItems.length) % modeItems.length;
    } else {
      return;
    }

    event.preventDefault();
    onModeChange(modeItems[nextIndex].key);
    (event.currentTarget.querySelectorAll("[role=tab]")[nextIndex] as HTMLElement | null)?.focus();
  };

  return (
    <div className="sunny-agent-mode-switch-v2" role="tablist" aria-label="Agent 工作台模式" onKeyDown={handleKeyDown}>
      {modeItems.map((item) => (
        <button
          key={item.key}
          type="button"
          role="tab"
          aria-selected={item.key === mode}
          tabIndex={item.key === mode ? 0 : -1}
          onClick={() => onModeChange(item.key)}
          className={[
            item.key === mode ? "active" : "",
            suggestedMode === item.key && item.key !== mode ? "suggested" : "",
          ].filter(Boolean).join(" ")}
        >
          {item.label}
          {suggestedMode === item.key && item.key !== mode ? (
            <span className="sunny-agent-mode-hint" aria-label="建议模式">●</span>
          ) : null}
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
  onStop?: () => void;
  onSubmit: () => void;
  pendingAction: null | PendingAction;
  placeholder: string;
  statusLabel: string;
  suggestedMode?: AgentWorkbenchMode | null;
};

export function AgentComposer({
  disabled,
  input,
  mode,
  onInputChange,
  onModeChange,
  onStop,
  onSubmit,
  pendingAction,
  placeholder,
  statusLabel,
  suggestedMode,
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
        <AgentModeSwitch mode={mode} onModeChange={onModeChange} suggestedMode={suggestedMode} />
        <span>{statusLabel}</span>
      </div>
      <div className="sunny-agent-composer-row">
        <textarea
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          rows={3}
          aria-label={pendingAction?.type === "await_confirmation" ? "待确认：可输入「确认」或「取消」，或使用上方按钮" : "输入要交给 Agent 的话"}
          placeholder={pendingAction?.type === "await_confirmation" ? "回复“确认”执行，或“取消”放弃。" : placeholder}
          className="sunny-agent-composer-input"
        />
        {disabled && onStop ? (
          <button
            type="button"
            onClick={onStop}
            className="sunny-agent-run-button"
          >
            <span className="sunny-agent-run-spinner" /> 停止
          </button>
        ) : (
          <button
            type="submit"
            disabled={disabled || input.trim().length === 0}
            className="sunny-agent-run-button"
          >
            {disabled ? <><span className="sunny-agent-run-spinner" /> 运行中</> : "发送"}
          </button>
        )}
      </div>
    </form>
  );
}
