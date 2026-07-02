"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

import type { PendingAction } from "@/lib/agent/schemas";
import type { AgentWorkbenchMode } from "@/lib/agent/workbench-mode";

import { AppButton } from "@/components/primitives/AppButton";
import { AppIconButton } from "@/components/primitives/AppIconButton";
import { useDashboardInspectorControl } from "../DashboardInspectorControlContext";
import { DashboardIcon, InspectorPanelIcon } from "../icons";
import { ComposerAddMenu } from "./ComposerAddMenu";
import { ComposerModeSelect, getComposerModeOption } from "./ComposerModeSelect";
import { formatIntentLabel } from "./constants";

type AgentComposerProps = {
  disabled?: boolean;
  input: string;
  modelName?: string;
  onCancelApproval?: () => void;
  onConfirmApproval?: () => void;
  onEditApproval?: (kind: "plan" | "schedule" | "generic") => void;
  onInputChange: (value: string) => void;
  onReturnToEditApproval?: () => void;
  onStop?: () => void;
  onSubmit: () => void;
  onWorkbenchModeChange: (mode: AgentWorkbenchMode) => void;
  pendingAction: null | PendingAction;
  placeholder: string;
  workbenchMode: AgentWorkbenchMode;
};

const COMPOSER_INPUT_MAX_HEIGHT_PX = 120;

export function AgentComposer({
  disabled,
  input,
  modelName = "DeepSeek V3",
  onCancelApproval,
  onConfirmApproval,
  onEditApproval,
  onInputChange,
  onReturnToEditApproval,
  onStop,
  onSubmit,
  onWorkbenchModeChange,
  pendingAction,
  placeholder,
  workbenchMode,
}: AgentComposerProps) {
  const { debugMode, openInspector, panelOpen, setDebugMode, togglePanel } =
    useDashboardInspectorControl();
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const activeMode = getComposerModeOption(workbenchMode);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, COMPOSER_INPUT_MAX_HEIGHT_PX)}px`;
  }, [input]);

  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionResults, setMentionResults] = useState<
    Array<{ collection: string; id: number; title: string }>
  >([]);
  const mentionDebounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleInputChange = useCallback(
    (value: string) => {
      onInputChange(value);

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
  const sendTitle =
    disabled && onStop
      ? "停止"
      : disabled
        ? "运行中"
        : workbenchMode === "execute"
          ? "生成 DryRun"
          : "发送任务";
  const panelLabel = panelOpen ? "收起当前上下文" : "打开当前上下文";
  const singlePendingAction = pendingAction?.type === "await_confirmation" ? pendingAction.action : null;
  const isAwaitingSingleConfirmation = Boolean(singlePendingAction);
  const pendingOperationLabel = singlePendingAction
    ? singlePendingAction.intent === "compose_plan" || singlePendingAction.intent === "create_plan"
      ? "创建计划"
      : formatIntentLabel(singlePendingAction.intent)
    : "";
  const pendingEditKind =
    singlePendingAction?.intent === "compose_plan" || singlePendingAction?.intent === "create_plan"
      ? "plan"
      : singlePendingAction?.intent === "compose_schedule_item" || singlePendingAction?.intent === "reschedule_item"
        ? "schedule"
        : "generic";
  const handleReturnToEdit = useCallback(() => {
    if (pendingEditKind === "plan" && onReturnToEditApproval) {
      onReturnToEditApproval();
      return;
    }

    onEditApproval?.(pendingEditKind);
  }, [onEditApproval, onReturnToEditApproval, pendingEditKind]);

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
          <ComposerModeSelect
            modelName={modelName}
            onOpenChange={setModeMenuOpen}
            onWorkbenchModeChange={onWorkbenchModeChange}
            open={modeMenuOpen}
            triggerAriaLabel="选择工作模式"
            triggerClassName="sunny-agent-composer-mode-trigger"
            workbenchMode={workbenchMode}
            trigger={
              <>
                <span>
                  <span className="sunny-agent-composer-mode-label">{activeMode.label}</span>{" "}
                  <span className="sunny-agent-composer-model-name">· {modelName}</span>
                </span>
                <DashboardIcon name="chevronDown" />
              </>
            }
          />
        </div>
        <div className={`sunny-agent-composer-input-wrap${isAwaitingSingleConfirmation ? " is-pending" : ""}`}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => handleInputChange(event.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!disabled && input.trim().length > 0) {
                  onSubmit();
                }
              }
            }}
            rows={1}
            aria-label={
              isAwaitingSingleConfirmation
                ? "待确认：补充修改要求，或直接确认执行"
                : pendingAction?.type === "await_queue_resume"
                  ? "待继续：可输入「继续」或「取消」"
                  : pendingAction?.type === "await_learning_followup"
                    ? `学习咨询上下文：${pendingAction.subject}`
                    : "输入要交给 Agent 的话"
            }
            placeholder={
              isAwaitingSingleConfirmation
                ? "补充修改要求，或直接确认执行"
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
          {isAwaitingSingleConfirmation ? (
            <div className="sunny-agent-composer-pending-mode" role="status">
              <span>等待确认 · {pendingOperationLabel}</span>
              <div className="sunny-agent-composer-pending-actions" role="toolbar" aria-label="待确认快捷操作">
                <AppButton
                  disabled={disabled || !onCancelApproval}
                  onClick={onCancelApproval}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  取消
                </AppButton>
                <AppButton
                  disabled={disabled || (!onEditApproval && !onReturnToEditApproval)}
                  onClick={handleReturnToEdit}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  返回修改
                </AppButton>
                <AppButton
                  disabled={disabled || !onConfirmApproval}
                  onClick={onConfirmApproval}
                  size="sm"
                  type="button"
                  variant="primary"
                >
                  确认执行
                </AppButton>
              </div>
            </div>
          ) : null}
        </div>
        <div className="sunny-agent-composer-actions">
          <ComposerAddMenu
            debugMode={debugMode}
            input={input}
            onDebugModeChange={setDebugMode}
            onInputChange={onInputChange}
            onOpenChange={setQuickMenuOpen}
            open={quickMenuOpen}
            triggerAriaLabel="添加上下文 / 文件 / 命令"
            triggerClassName={`sunny-agent-composer-icon-button sunny-agent-composer-plus-button${quickMenuOpen ? " is-active" : ""}`}
            trigger={<DashboardIcon name="plus" />}
          />
          <AppIconButton
            active={panelOpen}
            aria-label={panelLabel}
            aria-pressed={panelOpen}
            className="sunny-agent-composer-icon-button sunny-agent-composer-panel-button"
            icon={<InspectorPanelIcon open={panelOpen} />}
            onClick={() => {
              if (panelOpen) {
                togglePanel();
              } else {
                openInspector("context");
              }
            }}
            tooltip={panelLabel}
            type="button"
            variant="ghost"
          />
          {disabled && onStop ? (
            <button
              type="button"
              onClick={onStop}
              className="sunny-agent-run-button sunny-agent-composer-send"
              aria-label="停止"
              title="停止"
            >
              <span className="sunny-agent-run-spinner" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={disabled || input.trim().length === 0}
              className="sunny-agent-run-button sunny-agent-composer-send"
              aria-label={disabled ? "运行中" : sendLabel}
              title={sendTitle}
            >
              {disabled ? (
                <span className="sunny-agent-run-spinner" aria-hidden="true" />
              ) : (
                <span aria-hidden="true">{workbenchMode === "execute" ? sendLabel : "↑"}</span>
              )}
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
