"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { PendingAction } from "@/lib/agent/schemas";
import type { AgentWorkbenchMode } from "@/lib/agent/workbench-mode";

type QuickMenuItem = {
  label: string;
  children?: QuickMenuItem[];
  action?: "context" | "plan" | "memory" | "file" | "slash";
};

const QUICK_MENU: QuickMenuItem[] = [
  {
    label: "引用上下文",
    action: "context",
    children: [
      { label: "当前计划" },
      { label: "最近日程" },
      { label: "关联清单" },
      { label: "相关记忆" },
    ],
  },
  {
    label: "添加计划",
    action: "plan",
    children: [
      { label: "起草新计划" },
      { label: "关联当前计划" },
    ],
  },
  {
    label: "添加记忆",
    action: "memory",
    children: [
      { label: "偏好/习惯" },
      { label: "项目上下文" },
      { label: "工作流规则" },
    ],
  },
  { label: "添加文件", action: "file" },
  { label: "斜杠命令", action: "slash" },
];

const MODE_OPTIONS: Array<{
  key: AgentWorkbenchMode;
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
  {
    key: "timeline",
    label: "时间线",
    description: "记录或查询时间线事件，默认不会写入数据库。",
    placeholder: "描述要记录的时间线事件或查询条件",
  },
];

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
  const [expandedMenuIndex, setExpandedMenuIndex] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const activeMode = MODE_OPTIONS.find((mode) => mode.key === workbenchMode) ?? MODE_OPTIONS[0];

  const handleMenuClose = useCallback(() => {
    setQuickMenuOpen(false);
    setExpandedMenuIndex(null);
  }, []);

  useEffect(() => {
    if (!quickMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        handleMenuClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [quickMenuOpen, handleMenuClose]);

  // @mention state
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionResults, setMentionResults] = useState<
    Array<{ collection: string; id: number; title: string }>
  >([]);
  const mentionDebounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleInputChange = useCallback(
    (value: string) => {
      onInputChange(value);

      // Detect @mention trigger
      const atMatch = value.match(/@([^\s@]*)$/);
      if (atMatch) {
        const query = atMatch[1] ?? "";
        setMentionOpen(true);

        if (mentionDebounce.current) clearTimeout(mentionDebounce.current);
        mentionDebounce.current = setTimeout(async () => {
          try {
            const res = await fetch(
              `/api/command/search?q=${encodeURIComponent(query)}&limit=8`,
            );
            if (res.ok) {
              const data = (await res.json()) as { results: typeof mentionResults };
              setMentionResults(data.results ?? []);
            }
          } catch {
            // silent
          }
        }, 200);
      } else {
        setMentionOpen(false);
        setMentionResults([]);
      }
    },
    [onInputChange],
  );
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
        <div style={{ position: "relative", flex: 1 }}>
          <textarea
            value={input}
            onChange={(event) => handleInputChange(event.target.value)}
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
        {mentionOpen && mentionResults.length > 0 ? (
          <div
            className="sunny-agent-composer-mention-dropdown"
            role="listbox"
            aria-label="上下文引用建议"
          >
            {mentionResults.map((r, i) => (
              <button
                key={`${r.collection}-${r.id}-${i}`}
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => {
                  const newValue = input.replace(/@[^\s@]*$/, `@${r.title} `);
                  onInputChange(newValue);
                  setMentionOpen(false);
                }}
              >
                <span>{r.title}</span>
                <small>{r.collection}</small>
              </button>
            ))}
          </div>
        ) : null}
        </div>
        <div className="sunny-agent-composer-plus-menu" ref={menuRef}>
          <button
            type="button"
            className="sunny-agent-composer-plus-button"
            aria-label="打开快捷操作"
            aria-haspopup="menu"
            aria-expanded={quickMenuOpen}
            title="打开快捷操作"
            onClick={() => {
              setQuickMenuOpen((open) => !open);
              setExpandedMenuIndex(null);
              setModeMenuOpen(false);
            }}
          >
            <span aria-hidden="true">+</span>
          </button>
          {quickMenuOpen ? (
            <div className="sunny-agent-composer-quick-menu" role="menu" aria-label="快捷操作">
              {QUICK_MENU.map((item, index) => (
                <div key={item.label}>
                  <button
                    type="button"
                    role="menuitem"
                    className={expandedMenuIndex === index ? "is-active" : ""}
                    onClick={() => {
                      if (item.children && item.children.length > 0) {
                        setExpandedMenuIndex((prev) => (prev === index ? null : index));
                      } else if (item.action === "slash") {
                        onInputChange("/");
                        handleMenuClose();
                      } else if (item.action === "file") {
                        handleMenuClose();
                      }
                    }}
                  >
                    <span>{item.label}</span>
                    {item.children && item.children.length > 0 ? (
                      <span style={{ marginLeft: "auto", fontSize: "10px", opacity: 0.5 }}>▸</span>
                    ) : null}
                  </button>
                  {item.children && expandedMenuIndex === index ? (
                    <div className="sunny-agent-composer-quick-submenu" role="menu">
                      {item.children.map((child) => (
                        <button
                          key={child.label}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            if (item.action === "context") {
                              onInputChange(`${input} @${child.label} `);
                            } else if (item.action === "plan") {
                              onInputChange(child.label === "起草新计划" ? "/plan " : "/plan 关联当前计划 ");
                            } else if (item.action === "memory") {
                              onInputChange(`/memory ${child.label} `);
                            }
                            handleMenuClose();
                          }}
                        >
                          {child.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
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
