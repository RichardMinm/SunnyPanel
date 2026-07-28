"use client";

import { AppBadge, AppButton } from "@/components/primitives";
import type { LinkedObjectSummary } from "@/lib/core-linkage/contracts";

import {
  getLinkedObjectPresentation,
  type LinkedObjectSelectHandler,
} from "./LinkedObjectLink";

type LinkedObjectTargetBadgeProps = {
  count?: never;
  mode?: "source" | "type";
  onSelect?: LinkedObjectSelectHandler;
  summary: LinkedObjectSummary;
  unavailable?: boolean;
};

type LinkedObjectCountBadgeProps = {
  count: number;
  mode: "count";
  onSelect?: never;
  summary?: never;
  unavailable?: never;
};

export type LinkedObjectBadgeProps =
  | LinkedObjectCountBadgeProps
  | LinkedObjectTargetBadgeProps;

export function LinkedObjectBadge(props: LinkedObjectBadgeProps) {
  if (props.mode === "count") {
    return (
      <AppBadge className="sunny-linked-object-badge" tone="muted">
        {Math.max(0, props.count)} 项关联
      </AppBadge>
    );
  }

  const { onSelect, summary, unavailable = false } = props;
  const presentation = getLinkedObjectPresentation(summary.type);
  const text =
    props.mode === "source"
      ? `来自${presentation.label}`
      : presentation.label;
  const enabled = Boolean(onSelect) && !unavailable;

  if (!enabled) {
    return (
      <AppBadge className="sunny-linked-object-badge" tone="muted">
        {text}
      </AppBadge>
    );
  }

  return (
    <AppButton
      aria-label={`打开${presentation.label}：${summary.title}`}
      className="sunny-linked-object-badge-button"
      onClick={() => onSelect?.(summary)}
      size="sm"
      variant="ghost"
    >
      <AppBadge
        aria-hidden="true"
        className="sunny-linked-object-badge"
        tone="muted"
      >
        {text}
      </AppBadge>
    </AppButton>
  );
}
