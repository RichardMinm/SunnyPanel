"use client";

import { StatusBadge, type StatusTone } from "./StatusBadge";

export type ScheduleCardDensity = "compact" | "expanded" | "detail";

export type ScheduleCardProps = {
  density?: ScheduleCardDensity;
  time: string;
  title: string;
  status: string;
  priority: "high" | "medium" | "low";
  description?: string;
  relatedPlan?: string;
  relatedChecklist?: string;
  tags?: string[];
};

const priorityToneMap: Record<string, StatusTone> = {
  high: "red",
  medium: "yellow",
  low: "gray",
};

const priorityLabelMap: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

export function ScheduleCard({ density = "compact", time, title, status, priority, description, relatedPlan, relatedChecklist, tags }: ScheduleCardProps) {
  if (density === "compact") {
    return (
      <div className="flex items-center gap-2 rounded-md px-2 py-1 text-sm">
        <span className="shrink-0 text-xs font-medium text-muted">{time}</span>
        <span className="truncate font-medium text-foreground">{title}</span>
        <StatusBadge tone={priorityToneMap[priority]}>{priorityLabelMap[priority]}</StatusBadge>
      </div>
    );
  }

  if (density === "expanded") {
    return (
      <div className="rounded-lg border border-border/60 bg-surface-strong p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted">{time}</span>
          <div className="flex items-center gap-1.5">
            <StatusBadge tone={priorityToneMap[priority]}>{priorityLabelMap[priority]}</StatusBadge>
            <StatusBadge tone="blue">{status}</StatusBadge>
          </div>
        </div>
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        {description ? <p className="text-xs text-muted line-clamp-2">{description}</p> : null}
        <div className="flex flex-wrap gap-1 text-xs text-muted">
          {relatedPlan ? <span>关联: {relatedPlan}</span> : null}
          {relatedChecklist ? <span>清单: {relatedChecklist}</span> : null}
          {tags?.map((tag) => <span key={tag} className="rounded bg-surface px-1.5 py-0.5">{tag}</span>)}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/60 bg-surface-strong p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted">{time}</span>
        <div className="flex items-center gap-1.5">
          <StatusBadge tone={priorityToneMap[priority]}>{priorityLabelMap[priority]}优先级</StatusBadge>
          <StatusBadge tone="blue">{status}</StatusBadge>
        </div>
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description ? <p className="text-sm text-muted">{description}</p> : null}
      {relatedPlan || relatedChecklist ? (
        <div className="flex gap-4 text-sm">
          {relatedPlan ? <span className="text-muted">关联计划：<span className="font-medium text-foreground">{relatedPlan}</span></span> : null}
          {relatedChecklist ? <span className="text-muted">关联清单：<span className="font-medium text-foreground">{relatedChecklist}</span></span> : null}
        </div>
      ) : null}
      {tags && tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => <span key={tag} className="rounded-md bg-surface px-2 py-0.5 text-xs text-muted">{tag}</span>)}
        </div>
      ) : null}
    </div>
  );
}
