"use client";

import { type ReactNode } from "react";

import { cn } from "@/lib/ui/cn";

export type SidebarCollapseToggleProps = {
  /** Collapse section label (e.g. "会话", "已归档"). */
  label: ReactNode;
  /** Optional count badge — rendered as "(N)" after the label. */
  count?: number | string;
  /** Whether the section is currently expanded. Controls aria-expanded and arrow rotation. */
  expanded: boolean;
  /** Toggle callback — the parent manages the open/close state. */
  onToggle: () => void;
  /** Section icon rendered between the arrow and label. Typically a <DashboardIcon />. */
  icon?: ReactNode;
  /** Arrow / chevron icon. Defaults to a simple chevron if not provided.
   *  Rotation on expand/collapse is driven by the `data-open` attribute on the wrapper span. */
  arrowIcon?: ReactNode;
  /** When true, the button is disabled and onToggle is not called. */
  disabled?: boolean;
  /** Additional CSS class — keep sunny-dashboard-sidebar-collapse-toggle for old CSS compat. */
  className?: string;
};

export function SidebarCollapseToggle({
  label,
  count,
  expanded,
  onToggle,
  icon,
  arrowIcon,
  disabled = false,
  className,
}: SidebarCollapseToggleProps) {
  return (
    <button
      aria-expanded={expanded}
      className={cn(
        "sidebar-collapse-toggle",
        "sunny-dashboard-sidebar-collapse-toggle",
        className,
      )}
      disabled={disabled}
      onClick={onToggle}
      type="button"
    >
      <span
        className={cn("sidebar-collapse-toggle__arrow", "sunny-sidebar-fold-arrow")}
        data-open={expanded}
      >
        {arrowIcon}
      </span>
      {icon ? (
        <span
          className={cn(
            "sidebar-collapse-toggle__icon",
            "sunny-dashboard-sidebar-icon",
          )}
        >
          {icon}
        </span>
      ) : null}
      <span className="sidebar-collapse-toggle__label">{label}</span>
      {count !== undefined ? (
        <span className="sidebar-collapse-toggle__count">
          ({count})
        </span>
      ) : null}
    </button>
  );
}
