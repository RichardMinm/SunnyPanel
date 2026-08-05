"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import type { PendingAction } from "@/lib/agent/schemas";

import { AppButton } from "@/components/primitives/AppButton";
import { AppIconButton } from "@/components/primitives/AppIconButton";
import { useDashboardInspectorControl } from "../DashboardInspectorControlContext";
import { InspectorPanelIcon } from "../icons";
import { useDashboardMotion } from "../motion/dashboard-motion";
import { shouldSubmitComposerKey } from "./composer-keyboard";
import { formatIntentLabel } from "./constants";

type AgentComposerProps = {
  disabled?: boolean;
  focusRequestKey: number;
  input: string;
  onCancelApproval?: () => void;
  onConfirmApproval?: () => void;
  onEditApproval?: (kind: "plan" | "schedule" | "generic") => void;
  onInputChange: (value: string) => void;
  onReturnToEditApproval?: () => void;
  onStop?: () => void;
  onSubmit: () => void;
  pendingAction: null | PendingAction;
  placeholder: string;
};

const COMPOSER_INPUT_MAX_HEIGHT_PX = 120;

export function AgentComposer({
  disabled,
  focusRequestKey,
  input,
  onCancelApproval,
  onConfirmApproval,
  onEditApproval,
  onInputChange,
  onReturnToEditApproval,
  onStop,
  onSubmit,
  pendingAction,
  placeholder,
}: AgentComposerProps) {
  const { openInspector, panelOpen, togglePanel } = useDashboardInspectorControl();
  const { agentDisclosureView, agentStatusView } = useDashboardMotion();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isComposingRef = useRef(false);
  const suppressNextEnterRef = useRef(false);

  useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      textareaRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [focusRequestKey]);

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

  const closeMentionSearch = useCallback(() => {
    if (mentionDebounce.current) {
      clearTimeout(mentionDebounce.current);
      mentionDebounce.current = undefined;
    }
    setMentionOpen(false);
    setMentionResults([]);
  }, []);

  useEffect(() => () => {
    if (mentionDebounce.current) {
      clearTimeout(mentionDebounce.current);
    }
  }, []);

  const handleInputChange = useCallback(
    (value: string) => {
      onInputChange(value);

      if (isComposingRef.current) {
        return;
      }

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
        closeMentionSearch();
      }
    },
    [closeMentionSearch, onInputChange],
  );

  const sendTitle =
    disabled && onStop
      ? "停止"
      : disabled
        ? "运行中"
        : "发送";
  const panelLabel = panelOpen ? "收起上下文" : "添加上下文";
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
      : singlePendingAction?.intent === "compose_schedule_item" ||
          singlePendingAction?.intent === "create_schedule_items" ||
          singlePendingAction?.intent === "reschedule_item"
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
        if (isComposingRef.current) {
          return;
        }
        onSubmit();
      }}
    >
      <div className="sunny-agent-composer-row">
        <div className={`sunny-agent-composer-input-wrap${isAwaitingSingleConfirmation ? " is-pending" : ""}`}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => handleInputChange(event.target.value)}
            onCompositionStart={() => {
              isComposingRef.current = true;
              suppressNextEnterRef.current = false;
              closeMentionSearch();
            }}
            onCompositionEnd={(event) => {
              isComposingRef.current = false;
              suppressNextEnterRef.current = true;
              handleInputChange(event.currentTarget.value);
              window.setTimeout(() => {
                suppressNextEnterRef.current = false;
              }, 0);
            }}
            onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                suppressNextEnterRef.current
              ) {
                e.preventDefault();
                suppressNextEnterRef.current = false;
                return;
              }

              if (
                isComposingRef.current ||
                !shouldSubmitComposerKey(e.nativeEvent)
              ) {
                return;
              }

              e.preventDefault();
              if (!disabled && input.trim().length > 0) {
                onSubmit();
              }
            }}
            enterKeyHint="send"
            lang="zh-CN"
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
                    : placeholder
            }
            className="sunny-agent-composer-input"
          />
          <AnimatePresence initial={false}>
            {mentionOpen && mentionResults.length > 0 ? (
              <motion.div
                animate={agentDisclosureView.animate}
                className="sunny-agent-composer-mention-dropdown"
                exit={agentDisclosureView.exit}
                initial={agentDisclosureView.initial}
                key="mention-results"
                role="listbox"
                aria-label="上下文引用建议"
                transition={agentDisclosureView.transition}
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
              </motion.div>
            ) : null}
          </AnimatePresence>
          <AnimatePresence initial={false}>
            {isAwaitingSingleConfirmation ? (
              <motion.div
                animate={agentDisclosureView.animate}
                className="sunny-agent-composer-pending-mode"
                exit={agentDisclosureView.exit}
                initial={agentDisclosureView.initial}
                key="pending-confirmation"
                role="status"
                transition={agentDisclosureView.transition}
              >
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
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
        <div className="sunny-agent-composer-actions">
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
              data-state="running"
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
              data-state={disabled ? "running" : input.trim().length > 0 ? "ready" : "idle"}
              aria-label={disabled ? "运行中" : "发送"}
              title={sendTitle}
            >
              {disabled ? (
                <span className="sunny-agent-run-spinner" aria-hidden="true" />
              ) : (
                <motion.span
                  animate={agentStatusView.animate}
                  aria-hidden="true"
                  initial={agentStatusView.initial}
                  key="send-arrow"
                  transition={agentStatusView.transition}
                >
                  ↑
                </motion.span>
              )}
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
