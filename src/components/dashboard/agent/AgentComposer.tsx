"use client";

import { useState } from "react";

import type { PendingAction } from "@/lib/agent/schemas";
import type { AgentWorkbenchMode } from "@/lib/agent/workbench-mode";

const MODE_OPTIONS: Array<{
  key: Exclude<AgentWorkbenchMode, "timeline">;
  label: string;
  description: string;
  placeholder: string;
}> = [
  {
    key: "ask",
    label: "自动",
    description: "系统会判断回答或规划，执行前需要确认。",
    placeholder: "输入问题或任务，系统会自动判断回答或规划",
  },
  {
    key: "answer",
    label: "只回答",
    description: "只回答当前问题，不主动生成写入计划。",
    placeholder: "输入要咨询的问题，Agent 会直接回答",
  },
  {
    key: "plan",
    label: "规划",
    description: "会生成计划建议，默认不会写入数据库。",
    placeholder: "描述你的目标，Agent 会生成计划草案",
  },
  {
    key: "execute",
    label: "执行",
    description: "会先生成 DryRun，确认后才会写入数据库。",
    placeholder: "描述要执行的操作，系统会先生成 DryRun",
  },
  {
    key: "review",
    label: "回顾",
    description: "会复盘计划、日程或阶段，默认不会写入数据库。",
    placeholder: "输入要复盘的计划、日程或阶段",
  },
];

const QUICK_ACTIONS = ["引用上下文", "添加计划", "添加记忆", "添加文件", "斜杠命令"] as const;

type AgentComposerProps = {
  disabled?: boolean;
  input: string;
  onInputChange: (value: string) => void;
  onStop?: () => void;
  onSubmit: () => void;
  onWorkbenchModeChange: (mode: AgentWorkbenchMode) => void;
  pendingAction: null | PendingAction;
  placeholder: string;
  workbenchMode: AgentWorkbenchMode;
};

export function AgentComposer({
  disabled,
  input,
  onInputChange,
  onStop,
  onSubmit,
  onWorkbenchModeChange,
  pendingAction,
  placeholder,
  workbenchMode,
}: AgentComposerProps) {
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const activeMode = MODE_OPTIONS.find((mode) => mode.key === workbenchMode) ?? MODE_OPTIONS[0];
  const sendLabel = workbenchMode === "execute" ? "生成 DryRun" : "发送";

  return (
    <form
      className="sunny-agent-composer"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="sunny-agent-composer-row">
        <div className="sunny-agent-composer-mode-control">
          <button
            type="button"
            className="sunny-agent-composer-mode-trigger"
            aria-label="选择工作模式"
            aria-haspopup="menu"
            aria-expanded={modeMenuOpen}
            title={activeMode.description}
            onClick={() => {
              setModeMenuOpen((open) => !open);
              setQuickMenuOpen(false);
            }}
          >
            <span>{activeMode.label}</span>
            <span aria-hidden="true">⌄</span>
          </button>
          {modeMenuOpen ? (
            <div className="sunny-agent-composer-mode-menu" role="menu" aria-label="工作模式">
              {MODE_OPTIONS.map((mode) => (
                <button
                  key={mode.key}
                  type="button"
                  role="menuitem"
                  className={mode.key === workbenchMode ? "is-active" : ""}
                  onClick={() => {
                    onWorkbenchModeChange(mode.key);
                    setModeMenuOpen(false);
                  }}
                >
                  <strong>{mode.label}</strong>
                  <span>{mode.description}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <textarea
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          rows={1}
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
                : activeMode.placeholder || placeholder
          }
          className="sunny-agent-composer-input"
        />
        <div className="sunny-agent-composer-plus-menu">
          <button
            type="button"
            className="sunny-agent-composer-plus-button"
            aria-label="打开快捷操作"
            aria-haspopup="menu"
            aria-expanded={quickMenuOpen}
            title="打开快捷操作"
            onClick={() => {
              setQuickMenuOpen((open) => !open);
              setModeMenuOpen(false);
            }}
          >
            <span aria-hidden="true">+</span>
          </button>
          {quickMenuOpen ? (
            <div className="sunny-agent-composer-quick-menu" role="menu" aria-label="快捷操作">
              {QUICK_ACTIONS.map((label) => (
                <button key={label} type="button" role="menuitem" onClick={() => setQuickMenuOpen(false)}>
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
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
            aria-label={disabled ? "运行中" : sendLabel}
            title={disabled ? "运行中" : sendLabel}
          >
            {disabled ? <span className="sunny-agent-run-spinner" aria-hidden="true" /> : <span aria-hidden="true">{workbenchMode === "execute" ? sendLabel : "↑"}</span>}
          </button>
        )}
      </div>
    </form>
  );
}
