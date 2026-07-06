"use client";

import type { AgentActivityStatus, AgentActivityStep as AgentActivityStepModel } from "@/lib/agent/activity";

type AgentActivityStepItemProps = {
  active?: boolean;
  compact?: boolean;
  showDetails?: boolean;
  step: AgentActivityStepModel;
};

const statusLabelMap: Record<AgentActivityStatus, string> = {
  failed: "错误",
  idle: "空闲",
  queued: "排队",
  running: "正在",
  skipped: "跳过",
  success: "已完成",
  waiting: "等待确认",
  warning: "提醒",
};

const statusIconMap: Record<AgentActivityStatus, string> = {
  failed: "!",
  idle: "-",
  queued: "...",
  running: "•",
  skipped: "-",
  success: "✓",
  waiting: "II",
  warning: "!",
};

const formatValue = (value: unknown): string => {
  if (value === null) return "null";
  if (value === undefined) return "未记录";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `数组(${value.length})`;
  if (typeof value === "object") return "对象";
  return "未记录";
};

const titleForStatus = (step: AgentActivityStepModel) => {
  if (step.status === "running" && !/^正在/u.test(step.title)) {
    return `正在${step.title}`;
  }

  return step.title;
};

export function AgentActivityStepItem({
  active = false,
  compact = false,
  showDetails = false,
  step,
}: AgentActivityStepItemProps) {
  const details = step.details ? Object.entries(step.details).slice(0, 12) : [];
  const hasDetails = showDetails && details.length > 0;
  const metaItems = showDetails
    ? [
        step.kind,
        step.intent ? `intent: ${step.intent}` : null,
        step.toolName ? `tool: ${step.toolName}` : null,
        typeof step.latencyMs === "number" ? `${step.latencyMs}ms` : null,
        step.actionId ? `action: ${step.actionId}` : null,
      ].filter(Boolean)
    : [];
  const title = titleForStatus(step);

  return (
    <article
      className={`sunny-agent-activity-step sunny-agent-activity-step-${step.status}${compact ? " is-compact" : ""}`}
      data-active={active ? "true" : "false"}
      data-state={step.status}
    >
      <span className="sunny-agent-activity-marker" aria-hidden="true">
        <span>{statusIconMap[step.status]}</span>
      </span>
      <div className="sunny-agent-activity-copy">
        <div className="sunny-agent-activity-head">
          <h4>{title}</h4>
          <span className="sunny-agent-activity-state-label">{statusLabelMap[step.status]}</span>
        </div>
        {step.summary ? <p>{step.summary}</p> : null}
        {step.error?.message ? <p className="sunny-agent-activity-error">{step.error.message}</p> : null}
        {metaItems.length > 0 ? (
          <div className="sunny-agent-activity-meta" aria-label="Activity metadata">
            {metaItems.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        ) : null}
        {hasDetails ? (
          <details className="sunny-agent-activity-details">
            <summary>查看脱敏 details</summary>
            <dl>
              {details.map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{formatValue(value)}</dd>
                </div>
              ))}
            </dl>
          </details>
        ) : null}
      </div>
    </article>
  );
}
