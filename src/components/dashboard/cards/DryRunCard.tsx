"use client";

import { RiskBadge } from "./RiskBadge";
import { StatusBadge } from "./StatusBadge";

export type DryRunCardProps = {
  operationType: string;
  title?: string;
  targetCollection?: string;
  riskLevel: "high" | "medium" | "low";
  impactScope: string;
  impactSummary?: string;
  timeRange?: string;
  conflictStatus?: string;
  rollbackAvailable?: boolean;
  status: "awaiting_confirmation" | "confirmed" | "cancelled";
  onConfirm?: () => void;
  onEdit?: () => void;
  onCancel?: () => void;
  disabled?: boolean;
};

export function DryRunCard({
  operationType,
  title,
  targetCollection,
  riskLevel,
  impactScope,
  impactSummary,
  timeRange,
  conflictStatus,
  rollbackAvailable,
  status,
  onConfirm,
  onEdit,
  onCancel,
  disabled,
}: DryRunCardProps) {
  const statusLabel = status === "awaiting_confirmation" ? "等待确认"
    : status === "confirmed" ? "已确认" : "已取消";
  const statusTone = status === "awaiting_confirmation" ? "yellow" as const
    : status === "confirmed" ? "green" as const : "gray" as const;

  return (
    <div className="rounded-lg border border-border/60 bg-surface-strong p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">
          DryRun{title ? ` · ${title}` : ""}
        </h4>
        <StatusBadge tone={statusTone}>{statusLabel}</StatusBadge>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <span className="text-muted">操作类型</span>
          <p className="font-medium text-foreground">{operationType}</p>
        </div>
        <div>
          <span className="text-muted">风险等级</span>
          <p><RiskBadge level={riskLevel} /></p>
        </div>
        {targetCollection ? (
          <div>
            <span className="text-muted">目标集合</span>
            <p className="font-medium text-foreground">{targetCollection}</p>
          </div>
        ) : null}
        <div>
          <span className="text-muted">影响范围</span>
          <p className="font-medium text-foreground">{impactScope}</p>
        </div>
        {timeRange ? (
          <div>
            <span className="text-muted">时间</span>
            <p className="font-medium text-foreground">{timeRange}</p>
          </div>
        ) : null}
        {impactSummary ? (
          <div className="col-span-2">
            <span className="text-muted">影响摘要</span>
            <p className="font-medium text-foreground">{impactSummary}</p>
          </div>
        ) : null}
        {conflictStatus ? (
          <div>
            <span className="text-muted">冲突检测</span>
            <p className="font-medium text-foreground">{conflictStatus}</p>
          </div>
        ) : null}
        <div>
          <span className="text-muted">回滚状态</span>
          <p className="font-medium text-foreground">
            {rollbackAvailable === true ? "可回滚" : rollbackAvailable === false ? "不可回滚" : "—"}
          </p>
        </div>
      </div>

      {status === "awaiting_confirmation" ? (
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            disabled={disabled}
            onClick={onConfirm}
            className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50"
          >
            确认执行
          </button>
          {onEdit ? (
            <button
              type="button"
              disabled={disabled}
              onClick={onEdit}
              className="rounded-md border border-border px-4 py-1.5 text-sm font-semibold text-foreground hover:bg-surface disabled:opacity-50"
            >
              修改
            </button>
          ) : null}
          <button
            type="button"
            disabled={disabled}
            onClick={onCancel}
            className="rounded-md border border-border px-4 py-1.5 text-sm font-semibold text-muted hover:bg-surface disabled:opacity-50"
          >
            取消
          </button>
        </div>
      ) : null}
    </div>
  );
}
