"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ProposedAgentAction } from "@/lib/agent/schemas";

import { operationLabelMap, riskLevelLabelMap, visibilityLabelMap } from "./constants";
import { getPlanProposalFromAction, getScheduleProposalFromAction } from "./utils";

export type AgentApprovalCardProps = {
  action: null | ProposedAgentAction;
  disabled?: boolean;
  onCancel: () => void;
  onEdit?: (kind: "plan" | "schedule" | "generic") => void;
  onConfirm: () => void;
};

export function AgentApprovalCard({ action, disabled, onCancel, onConfirm, onEdit }: AgentApprovalCardProps) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [rovingIndex, setRovingIndex] = useState(0);

  const setButtonRef = useCallback((index: number) => {
    return (element: HTMLButtonElement | null) => {
      buttonRefs.current[index] = element;
    };
  }, []);

  useEffect(() => {
    if (!action) {
      return;
    }

    requestAnimationFrame(() => {
      buttonRefs.current[0]?.focus();
    });
    // 父级用 action.id 作为 key 重置 roving；此处仅同步焦点到第一个按钮
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在 action id 变化时重绑焦点
  }, [action?.id]);

  const buttonCount = onEdit ? 3 : 2;

  const focusButtonIndex = useCallback(
    (nextIndex: number) => {
      const bounded = Math.max(0, Math.min(buttonCount - 1, nextIndex));
      setRovingIndex(bounded);
      requestAnimationFrame(() => {
        buttonRefs.current[bounded]?.focus();
      });
    },
    [buttonCount],
  );

  const onActionsKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!action || disabled) {
        return;
      }

      const fromKeyboard = buttonRefs.current.findIndex((el) => el === document.activeElement);
      const base = fromKeyboard === -1 ? rovingIndex : fromKeyboard;

      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        focusButtonIndex((base + 1) % buttonCount);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        focusButtonIndex((base + buttonCount - 1) % buttonCount);
      } else if (event.key === "Home") {
        event.preventDefault();
        focusButtonIndex(0);
      } else if (event.key === "End") {
        event.preventDefault();
        focusButtonIndex(buttonCount - 1);
      }
    },
    [action, buttonCount, disabled, focusButtonIndex, rovingIndex],
  );

  if (!action) {
    return null;
  }

  const firstChange = action.changes[0];
  const planProposal = getPlanProposalFromAction(action);
  const scheduleProposal = getScheduleProposalFromAction(action);
  const confirmLabel = planProposal ? "确认创建计划" : scheduleProposal ? "确认写入日程" : "确认执行";
  const editLabel = scheduleProposal ? "改时间" : planProposal ? "改需求" : "调整请求";

  return (
    <section
      id="agent-pending-approval"
      className={`sunny-agent-approval-banner sunny-agent-approval-banner-${action.riskLevel}`}
      aria-live="polite"
      aria-relevant="additions text"
      role="region"
      aria-label="待确认操作"
    >
      <div className="sunny-agent-approval-banner-main">
        <div>
          <p>待你确认</p>
          <h3 id="agent-pending-approval-title">{action.summary}</h3>
        </div>
        <span>{riskLevelLabelMap[action.riskLevel]}</span>
      </div>
      <div className="sunny-agent-approval-banner-meta" aria-describedby="agent-pending-approval-title">
        <span>{action.toolName ?? action.intent}</span>
        <span>{firstChange ? operationLabelMap[firstChange.operation] : "待确认"}</span>
        <span>{firstChange ? `${firstChange.collection}${firstChange.documentId ? ` #${firstChange.documentId}` : ""}` : "未解析"}</span>
        <span>{firstChange?.visibility ? visibilityLabelMap[firstChange.visibility] : "未知可见性"}</span>
      </div>
      {planProposal ? (
        <div className="sunny-agent-proposal-card sunny-agent-plan-proposal">
          <div>
            <span>计划标题</span>
            <strong>{planProposal.title}</strong>
          </div>
          <p>{planProposal.goal}</p>
          {planProposal.motivation ? <p>{planProposal.motivation}</p> : null}
          <div className="sunny-agent-proposal-grid">
            <div>
              <span>范围</span>
              <p>{planProposal.scope || "未指定"}</p>
            </div>
            <div>
              <span>优先级</span>
              <p>{planProposal.suggestedPriority}</p>
            </div>
            <div>
              <span>截止</span>
              <p>{planProposal.suggestedDueDate || "未设定"}</p>
            </div>
          </div>
          <div className="sunny-agent-proposal-columns">
            <div>
              <span>关键步骤</span>
              <ul>
                {planProposal.keySteps.slice(0, 5).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <span>完成标准</span>
              <ul>
                {planProposal.successCriteria.slice(0, 4).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
          {planProposal.risks.length > 0 ? (
            <div className="sunny-agent-proposal-warning">
              <span>风险</span>
              <p>{planProposal.risks.slice(0, 3).join("；")}</p>
            </div>
          ) : null}
          <div className="sunny-agent-proposal-brief">
            <span>Agent 协作说明</span>
            <p>{planProposal.agentBrief}</p>
          </div>
        </div>
      ) : scheduleProposal ? (
        <div className="sunny-agent-proposal-card sunny-agent-schedule-proposal">
          <div>
            <span>日程标题</span>
            <strong>{scheduleProposal.title}</strong>
          </div>
          <div className="sunny-agent-proposal-grid">
            <div>
              <span>日期</span>
              <p>{scheduleProposal.date}</p>
            </div>
            <div>
              <span>时间</span>
              <p>{scheduleProposal.isAllDay ? "全天" : `${scheduleProposal.startTime ?? "未定"}-${scheduleProposal.endTime ?? "未定"}`}</p>
            </div>
            <div>
              <span>优先级</span>
              <p>{scheduleProposal.priority}</p>
            </div>
          </div>
          <p>{scheduleProposal.reason}</p>
          <div className="sunny-agent-proposal-grid">
            <div>
              <span>关联计划</span>
              <p>{scheduleProposal.relatedPlanId ? `#${scheduleProposal.relatedPlanId}` : "未关联"}</p>
            </div>
            <div>
              <span>关联清单</span>
              <p>{scheduleProposal.relatedChecklistId ? `#${scheduleProposal.relatedChecklistId}` : "未关联"}</p>
            </div>
          </div>
          {scheduleProposal.conflicts.length > 0 ? (
            <div className="sunny-agent-proposal-warning">
              <span>时间冲突</span>
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
              <span>冲突检测</span>
              <p>没有检测到同时间段冲突。</p>
            </div>
          )}
        </div>
      ) : (
        <p className="sunny-agent-approval-banner-preview">{firstChange?.preview ?? "确认前请检查右侧「变更」面板。"}</p>
      )}
      <div
        className="sunny-agent-approval-banner-actions"
        role="toolbar"
        aria-label="确认或取消此操作"
        aria-orientation="horizontal"
        onKeyDown={onActionsKeyDown}
      >
        <button
          ref={setButtonRef(0)}
          type="button"
          disabled={disabled}
          tabIndex={rovingIndex === 0 ? 0 : -1}
          onFocus={() => setRovingIndex(0)}
          onClick={onConfirm}
          className="sunny-agent-confirm-button disabled:cursor-not-allowed disabled:opacity-60"
        >
          {confirmLabel}
        </button>
        {onEdit ? (
          <button
            ref={setButtonRef(1)}
            type="button"
            disabled={disabled}
            tabIndex={rovingIndex === 1 ? 0 : -1}
            onFocus={() => setRovingIndex(1)}
            onClick={() => onEdit(planProposal ? "plan" : scheduleProposal ? "schedule" : "generic")}
            className="sunny-agent-edit-button disabled:cursor-not-allowed disabled:opacity-60"
          >
            {editLabel}
          </button>
        ) : null}
        <button
          ref={setButtonRef(onEdit ? 2 : 1)}
          type="button"
          disabled={disabled}
          tabIndex={rovingIndex === (onEdit ? 2 : 1) ? 0 : -1}
          onFocus={() => setRovingIndex(onEdit ? 2 : 1)}
          onClick={onCancel}
          className="sunny-agent-cancel-button-v2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          取消
        </button>
      </div>
    </section>
  );
}
