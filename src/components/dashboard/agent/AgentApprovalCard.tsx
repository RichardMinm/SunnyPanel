"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { AppButton } from "@/components/primitives/AppButton";
import type { ProposedAgentAction } from "@/lib/agent/schemas";

import {
  formatCollectionLabel,
  formatCapabilityLabel,
  formatCapabilityPhaseLabel,
  formatIntentLabel,
  formatPriorityLabel,
  getCapabilityPhase,
  operationLabelMap,
  riskLevelLabelMap,
  visibilityLabelMap,
} from "./constants";
import { getDecomposedFromAction, getPlanProposalFromAction, getScheduleProposalFromAction } from "./utils";

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
  const [confirmationDraft, setConfirmationDraft] = useState({ actionId: "", phrase: "" });

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
  const decomposedPlan = getDecomposedFromAction(action);
  const scheduleProposal = getScheduleProposalFromAction(action);
  const motivationDuplicatesGoal =
    planProposal?.motivation &&
    planProposal.goal &&
    (planProposal.motivation === planProposal.goal ||
      planProposal.goal.includes(planProposal.motivation.slice(0, 24)));
  const confirmLabel = "确认";
  const editLabel = "修改";
  const isHighRisk = action.riskLevel === "high";
  const confirmPhrase = confirmationDraft.actionId === action.id ? confirmationDraft.phrase : "";
  const confirmDisabled = Boolean(disabled || (isHighRisk && confirmPhrase.trim() !== "确认执行"));
  const affectedCount = action.affectedDocuments?.length ?? action.changes.length;
  const writesDatabase = action.changes.length > 0;
  const operationType = action.capability
    ? formatCapabilityLabel(action.capability)
    : formatIntentLabel(action.intent);
  const capabilityPhase = action.capability ? getCapabilityPhase(action.capability) : null;
  const capabilityFlowHint =
    action.capability?.startsWith("preview_") && action.riskLevel !== "high"
      ? "预览提案 → 确认后执行"
      : action.capability?.startsWith("preview_") && action.riskLevel === "high"
        ? "高风险预览 → 确认短语后执行"
        : null;
  const scheduleTimeRange = scheduleProposal
    ? scheduleProposal.isAllDay
      ? `${scheduleProposal.date} · 全天`
      : `${scheduleProposal.date} ${scheduleProposal.startTime ?? "未定"}-${scheduleProposal.endTime ?? "未定"}`
    : null;
  const conflictStatus = scheduleProposal
    ? scheduleProposal.conflicts.length > 0
      ? `${scheduleProposal.conflicts.length} 个冲突`
      : "无冲突"
    : null;
  const rollbackStatus = action.rollbackAvailable
    ? "可回滚"
    : action.rollbackPayload
      ? "执行后可回滚"
      : "暂不可回滚";
  const nextEffects = planProposal
    ? ["保存当前计划为草稿", "进入待办队列", "可继续拆分为学习阶段"]
    : scheduleProposal
      ? ["保存当前日程提案", "同步关联计划或清单", "保留执行摘要以便撤销或追踪"]
      : action.changes.slice(0, 3).map((change) => change.preview);

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
          <p>
            等待确认 · {operationType}
            {capabilityPhase && capabilityPhase !== "unknown" ? (
              <span className={`sunny-agent-capability-badge sunny-agent-capability-${capabilityPhase}`}>
                {formatCapabilityPhaseLabel(action.capability!)}
              </span>
            ) : null}
          </p>
          <h3 id="agent-pending-approval-title">{action.summary}</h3>
          {capabilityFlowHint ? <p className="sunny-agent-capability-flow-hint">{capabilityFlowHint}</p> : null}
        </div>
        <span className={`sunny-agent-risk-pill-v2 sunny-agent-risk-${action.riskLevel}`}>
          {riskLevelLabelMap[action.riskLevel]}
        </span>
      </div>
      <div className="sunny-agent-confirmation-grid" aria-label="待确认操作摘要">
        <div>
          <span>操作类型</span>
          <strong>{operationType}</strong>
        </div>
        {scheduleProposal ? (
          <>
            <div>
              <span>时间</span>
              <strong>{scheduleTimeRange}</strong>
            </div>
            <div>
              <span>冲突检测</span>
              <strong>{conflictStatus}</strong>
            </div>
            <div>
              <span>回滚状态</span>
              <strong>{rollbackStatus}</strong>
            </div>
          </>
        ) : (
          <>
            <div>
              <span>写入数据库</span>
              <strong>{writesDatabase ? "确认后写入" : "不会写入"}</strong>
            </div>
            <div>
              <span>影响范围</span>
              <strong>{affectedCount > 0 ? `将影响 ${affectedCount} 项数据` : "未检测到数据变更"}</strong>
            </div>
            <div>
              <span>回滚状态</span>
              <strong>{rollbackStatus}</strong>
            </div>
          </>
        )}
      </div>
      <details className="sunny-agent-confirmation-details">
        <summary>查看详情</summary>
        <div className="sunny-agent-approval-banner-meta" aria-describedby="agent-pending-approval-title">
          <span>{action.capability ? formatCapabilityLabel(action.capability) : formatIntentLabel(action.intent)}</span>
          <span>{firstChange ? operationLabelMap[firstChange.operation] : "待确认"}</span>
          <span>{firstChange ? `${formatCollectionLabel(firstChange.collection)}${firstChange.documentId ? ` #${firstChange.documentId}` : ""}` : "未解析"}</span>
          <span>{firstChange?.visibility ? visibilityLabelMap[firstChange.visibility] : "未知可见性"}</span>
        </div>
        {planProposal ? (
          <div className="sunny-agent-proposal-card sunny-agent-plan-proposal">
            <div>
              <span>计划标题</span>
              <strong>{planProposal.title}</strong>
            </div>
            <p>{planProposal.goal}</p>
            {planProposal.motivation && !motivationDuplicatesGoal ? <p>{planProposal.motivation}</p> : null}
            {decomposedPlan ? (
              <div className="sunny-agent-proposal-columns">
                <div>
                  <span>学习阶段（{decomposedPlan.phases.length}）</span>
                  <ul>
                    {decomposedPlan.phases.map((phase) => (
                      <li key={phase.title}>
                        <strong>{phase.title}</strong>（{phase.estimatedDays} 天）
                        {phase.milestones[0]?.tasks.length ? (
                          <span> — {phase.milestones[0].tasks.slice(0, 3).join("、")}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
            <div className="sunny-agent-proposal-grid">
              <div>
                <span>范围</span>
                <p>{planProposal.scope || "未指定"}</p>
              </div>
              <div>
                <span>优先级</span>
                <p>{formatPriorityLabel(planProposal.suggestedPriority)}</p>
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
            {!decomposedPlan && planProposal.agentBrief ? (
              <div className="sunny-agent-proposal-brief">
                <span>协作说明</span>
                <p>{planProposal.agentBrief}</p>
              </div>
            ) : decomposedPlan?.weeklyRhythm ? (
              <div className="sunny-agent-proposal-brief">
                <span>学习节奏</span>
                <p>{decomposedPlan.weeklyRhythm}</p>
              </div>
            ) : null}
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
                <p>{formatPriorityLabel(scheduleProposal.priority)}</p>
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
          <p className="sunny-agent-approval-banner-preview">{firstChange?.preview ?? "确认前可查看详情面板。"}</p>
        )}
        {nextEffects.length > 0 ? (
          <div className="sunny-agent-confirmation-next">
            <span>确认后将</span>
            <ul>
              {nextEffects.map((effect) => (
                <li key={effect}>{effect}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </details>
      {isHighRisk && action.intent === "delete_record" ? (
        <label className="sunny-agent-confirmation-phrase">
          <span>删除操作：请输入“确认执行”后才会删除，此操作不可撤销（可从快照回滚）。</span>
          <input
            value={confirmPhrase}
            onChange={(event) => setConfirmationDraft({ actionId: action.id, phrase: event.target.value })}
            placeholder="确认执行"
            disabled={disabled}
          />
        </label>
      ) : isHighRisk ? (
        <label className="sunny-agent-confirmation-phrase">
          <span>高风险操作：请输入“确认执行”后才会执行。</span>
          <input
            value={confirmPhrase}
            onChange={(event) => setConfirmationDraft({ actionId: action.id, phrase: event.target.value })}
            placeholder="确认执行"
            disabled={disabled}
          />
        </label>
      ) : null}
      <div
        className="sunny-agent-approval-banner-actions"
        role="toolbar"
        aria-label="确认或取消此操作"
        aria-orientation="horizontal"
        onKeyDown={onActionsKeyDown}
      >
        <AppButton
          ref={setButtonRef(0)}
          className="sunny-agent-confirm-button"
          disabled={confirmDisabled}
          onClick={onConfirm}
          onFocus={() => setRovingIndex(0)}
          tabIndex={rovingIndex === 0 ? 0 : -1}
          type="button"
          variant="primary"
        >
          {confirmLabel}
        </AppButton>
        {onEdit ? (
          <AppButton
            ref={setButtonRef(1)}
            className="sunny-agent-edit-button"
            disabled={disabled}
            onClick={() => onEdit(planProposal ? "plan" : scheduleProposal ? "schedule" : "generic")}
            onFocus={() => setRovingIndex(1)}
            tabIndex={rovingIndex === 1 ? 0 : -1}
            type="button"
            variant="outline"
          >
            {editLabel}
          </AppButton>
        ) : null}
        <AppButton
          ref={setButtonRef(onEdit ? 2 : 1)}
          className="sunny-agent-cancel-button-v2"
          disabled={disabled}
          onClick={onCancel}
          onFocus={() => setRovingIndex(onEdit ? 2 : 1)}
          tabIndex={rovingIndex === (onEdit ? 2 : 1) ? 0 : -1}
          type="button"
          variant="secondary"
        >
          取消
        </AppButton>
      </div>
    </section>
  );
}
