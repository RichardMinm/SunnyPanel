"use client";

import { useMemo, useState } from "react";

import { AppBadge } from "@/components/primitives/AppBadge";
import { AppButton } from "@/components/primitives/AppButton";
import { AppCard } from "@/components/primitives/AppCard";
import type { ProposedAgentAction } from "@/lib/agent/schemas";
import { isRecord } from "@/lib/shared/is-record";

import {
  formatCollectionLabel,
  formatPriorityLabel,
  operationLabelMap,
  riskLevelLabelMap,
  visibilityLabelMap,
} from "./constants";
import { getDecomposedFromAction, getPlanProposalFromAction } from "./utils";

type PlanConfirmationCardProps = {
  action: ProposedAgentAction;
  disabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onReturnToEdit: () => void;
};

type PlanConfirmationSummaryItem = {
  label: string;
  value: string;
};

const riskToneMap = {
  high: "danger",
  low: "success",
  medium: "warning",
} as const;

export function isPlanConfirmationAction(action: ProposedAgentAction): boolean {
  if (action.intent !== "compose_plan" && action.intent !== "create_plan") {
    return false;
  }

  return action.changes.some((change) => change.collection === "plans" && change.operation === "create")
    || action.affectedDocuments?.some((document) => document.collection === "plans" && document.operation === "create")
    || action.intent === "compose_plan"
    || action.intent === "create_plan";
}

function getStringArg(action: ProposedAgentAction, key: string): null | string {
  if (!isRecord(action.args)) return null;
  const value = action.args[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function countDecomposedTasks(action: ProposedAgentAction): number {
  const decomposed = getDecomposedFromAction(action);
  if (!decomposed) return 0;

  return decomposed.phases.reduce((count, phase) => (
    count + phase.milestones.reduce((phaseCount, milestone) => phaseCount + milestone.tasks.length, 0)
  ), 0);
}

function buildPlanSummary(action: ProposedAgentAction): PlanConfirmationSummaryItem[] {
  const proposal = getPlanProposalFromAction(action);
  const decomposed = getDecomposedFromAction(action);
  const firstPlanChange = action.changes.find((change) => change.collection === "plans");
  const firstAffectedPlan = action.affectedDocuments?.find((document) => document.collection === "plans");
  const visibility = firstAffectedPlan?.visibility ?? firstPlanChange?.visibility ?? "unknown";
  const phaseCount = decomposed?.phases.length ?? 0;
  const taskCount = countDecomposedTasks(action) || proposal?.keySteps.length || action.changes.length;

  return [
    {
      label: "目标",
      value: proposal?.goal ?? getStringArg(action, "goal") ?? firstPlanChange?.preview ?? "待确认",
    },
    {
      label: "截止时间",
      value: proposal?.suggestedDueDate ?? getStringArg(action, "suggestedDueDate") ?? "未设定",
    },
    {
      label: "阶段数量",
      value: phaseCount > 0 ? `${phaseCount} 个阶段` : "待确认",
    },
    {
      label: "任务数量",
      value: taskCount > 0 ? `${taskCount} 个任务` : "待确认",
    },
    {
      label: "影响范围",
      value: "新增 1 项计划",
    },
    {
      label: "可见性",
      value: visibilityLabelMap[visibility],
    },
  ];
}

function getPlanTitle(action: ProposedAgentAction): string {
  const proposal = getPlanProposalFromAction(action);
  const affectedTitle = action.affectedDocuments?.find((document) => document.collection === "plans")?.title;

  return proposal?.title ?? affectedTitle ?? getStringArg(action, "title") ?? action.summary;
}

function getRollbackStatus(action: ProposedAgentAction): "不可回滚" | "可回滚" {
  return action.rollbackAvailable || action.rollbackPayload ? "可回滚" : "不可回滚";
}

function PlanConfirmationHeader({ action }: { action: ProposedAgentAction }) {
  const title = getPlanTitle(action);
  const rollbackStatus = getRollbackStatus(action);

  return (
    <header className="sunny-plan-confirmation-header">
      <div className="sunny-plan-confirmation-title-block">
        <div className="sunny-plan-confirmation-badges">
          <AppBadge tone="accent">等待确认</AppBadge>
          <AppBadge tone="muted">创建计划</AppBadge>
          <AppBadge tone={riskToneMap[action.riskLevel]}>{riskLevelLabelMap[action.riskLevel]}</AppBadge>
          <AppBadge tone={rollbackStatus === "可回滚" ? "success" : "muted"}>{rollbackStatus}</AppBadge>
        </div>
        <h3>{title}</h3>
      </div>
      <p>确认后将创建这项计划。你可以取消、返回修改，或确认执行。确认后才会真正创建计划。</p>
    </header>
  );
}

function PlanConfirmationSummary({ action }: { action: ProposedAgentAction }) {
  const summaryItems = useMemo(() => buildPlanSummary(action), [action]);

  return (
    <dl className="sunny-plan-confirmation-summary" aria-label="计划创建确认摘要">
      {summaryItems.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function PlanConfirmationRisk({ action }: { action: ProposedAgentAction }) {
  const rollbackStatus = getRollbackStatus(action);

  return (
    <p className="sunny-plan-confirmation-risk">
      {riskLevelLabelMap[action.riskLevel]}：该操作将写入数据库，{rollbackStatus === "可回滚" ? "执行后可回滚。" : "当前没有可用回滚预案。"}
    </p>
  );
}

function PlanConfirmationPreview({ action }: { action: ProposedAgentAction }) {
  const proposal = getPlanProposalFromAction(action);
  const decomposed = getDecomposedFromAction(action);

  return (
    <details className="sunny-plan-confirmation-preview">
      <summary>查看完整预览</summary>
      <div className="sunny-plan-confirmation-preview-scroll">
        <div className="sunny-plan-confirmation-preview-section">
          <span>变更预览</span>
          <ul>
            {action.changes.map((change, index) => (
              <li key={`${change.collection}-${change.operation}-${index}`}>
                <strong>
                  {operationLabelMap[change.operation]} {formatCollectionLabel(change.collection)}
                </strong>
                <p>{change.preview}</p>
                {change.beforePreview || change.afterPreview ? (
                  <div className="sunny-plan-confirmation-diff">
                    {change.beforePreview ? <del>{change.beforePreview}</del> : null}
                    {change.afterPreview ? <ins>{change.afterPreview}</ins> : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
        {proposal ? (
          <div className="sunny-plan-confirmation-preview-section">
            <span>计划内容</span>
            <div className="sunny-plan-confirmation-preview-grid">
              <div>
                <small>范围</small>
                <p>{proposal.scope || "未指定"}</p>
              </div>
              <div>
                <small>优先级</small>
                <p>{formatPriorityLabel(proposal.suggestedPriority)}</p>
              </div>
              <div>
                <small>完成标准</small>
                <p>{proposal.successCriteria.slice(0, 3).join("；") || "待确认"}</p>
              </div>
            </div>
          </div>
        ) : null}
        {decomposed ? (
          <div className="sunny-plan-confirmation-preview-section">
            <span>阶段与任务</span>
            <ol>
              {decomposed.phases.map((phase) => (
                <li key={phase.title}>
                  <strong>{phase.title}</strong>
                  <p>{phase.goal}</p>
                  <ul>
                    {phase.milestones.flatMap((milestone) => milestone.tasks).map((task) => (
                      <li key={task}>{task}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    </details>
  );
}

function PlanConfirmationActions({
  confirmDisabled,
  disabled,
  onCancel,
  onConfirm,
  onReturnToEdit,
}: {
  confirmDisabled: boolean;
  disabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onReturnToEdit: () => void;
}) {
  return (
    <div className="sunny-plan-confirmation-actions" role="toolbar" aria-label="取消、返回修改或确认执行">
      <AppButton disabled={disabled} onClick={onCancel} type="button" variant="secondary">
        取消
      </AppButton>
      <AppButton disabled={disabled} onClick={onReturnToEdit} type="button" variant="outline">
        返回修改
      </AppButton>
      <AppButton disabled={confirmDisabled} onClick={onConfirm} type="button" variant="primary">
        确认执行
      </AppButton>
    </div>
  );
}

export function PlanConfirmationCard({
  action,
  disabled,
  onCancel,
  onConfirm,
  onReturnToEdit,
}: PlanConfirmationCardProps) {
  const [confirmationPhrase, setConfirmationPhrase] = useState("");
  const isHighRisk = action.riskLevel === "high";
  const confirmDisabled = Boolean(disabled || (isHighRisk && confirmationPhrase.trim() !== "确认执行"));

  return (
    <AppCard
      id="agent-pending-approval"
      className={`sunny-plan-confirmation-card sunny-agent-approval-banner sunny-agent-approval-banner-${action.riskLevel}`}
      padding="none"
      role="region"
      aria-live="polite"
      aria-label="计划创建等待确认"
    >
      <PlanConfirmationHeader action={action} />
      <PlanConfirmationSummary action={action} />
      <PlanConfirmationRisk action={action} />
      <PlanConfirmationPreview action={action} />
      {isHighRisk ? (
        <label className="sunny-plan-confirmation-phrase">
          <span>高风险操作：请输入“确认执行”后才会执行。</span>
          <input
            disabled={disabled}
            onChange={(event) => setConfirmationPhrase(event.target.value)}
            placeholder="确认执行"
            value={confirmationPhrase}
          />
        </label>
      ) : null}
      <PlanConfirmationActions
        confirmDisabled={confirmDisabled}
        disabled={disabled}
        onCancel={onCancel}
        onConfirm={onConfirm}
        onReturnToEdit={onReturnToEdit}
      />
    </AppCard>
  );
}
