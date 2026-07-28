"use client";

import { DashboardIcon, type DashboardIconName } from "@/components/dashboard/icons";
import { AppButton } from "@/components/primitives";
import type { LinkedObjectSummary } from "@/lib/core-linkage/contracts";

type LinkedObjectPresentation = {
  icon: DashboardIconName;
  label: string;
};

const PRESENTATION_BY_TYPE: Record<
  LinkedObjectSummary["type"],
  LinkedObjectPresentation
> = {
  checklist: {
    icon: "checklist",
    label: "清单",
  },
  plan: {
    icon: "plans",
    label: "计划",
  },
  schedule: {
    icon: "schedule",
    label: "日程",
  },
  timeline: {
    icon: "timeline",
    label: "时间线",
  },
};

export type LinkedObjectSelectHandler = (
  summary: LinkedObjectSummary,
) => void;

export type LinkedObjectLinkProps = {
  onSelect?: LinkedObjectSelectHandler;
  summary: LinkedObjectSummary;
  unavailable?: boolean;
};

export function getLinkedObjectPresentation(
  type: LinkedObjectSummary["type"],
): LinkedObjectPresentation {
  return PRESENTATION_BY_TYPE[type];
}

export function LinkedObjectLink({
  onSelect,
  summary,
  unavailable = false,
}: LinkedObjectLinkProps) {
  const presentation = getLinkedObjectPresentation(summary.type);
  const enabled = Boolean(onSelect) && !unavailable;
  const accessibleName = enabled
    ? `打开${presentation.label}：${summary.title}`
    : `${presentation.label}不可用：${summary.title}`;
  const date =
    summary.type === "schedule" || summary.type === "timeline"
      ? summary.date
      : null;

  return (
    <AppButton
      aria-label={accessibleName}
      className="sunny-linked-object-link"
      disabled={!enabled}
      onClick={enabled ? () => onSelect?.(summary) : undefined}
      size="sm"
      variant="ghost"
    >
      <span
        aria-hidden="true"
        className="sunny-linked-object-link__icon"
        data-linked-object-icon={presentation.icon}
      >
        <DashboardIcon name={presentation.icon} />
      </span>
      <span aria-hidden="true" className="sunny-linked-object-link__kind">
        {presentation.label}
      </span>
      <span
        aria-hidden="true"
        className="sunny-linked-object-link__title"
        title={summary.title}
      >
        {summary.title}
      </span>
      {date ? (
        <time
          aria-hidden="true"
          className="sunny-linked-object-link__meta"
          dateTime={date}
        >
          {date}
        </time>
      ) : null}
    </AppButton>
  );
}
