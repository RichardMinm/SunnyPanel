"use client";

import { type MouseEvent, type ReactNode } from "react";

import { cn } from "@/lib/ui/cn";

export type SidebarThreadItemProps = {
  /** Thread identifier, used as React key by the parent. */
  id: number | string;
  /** Thread title — single line truncated via CSS. */
  title: ReactNode;
  /** Optional metadata line (status, tags, etc.). */
  meta?: ReactNode;
  /** Whether this thread is the currently selected one. */
  active?: boolean;
  /** Optional context / status marker rendered alongside the menu. */
  contextMarker?: ReactNode;
  /** Menu slot — typically a <ThreadRowMenu />. Rendered as sibling to the button. */
  menu?: ReactNode;
  /** Click handler for selecting this thread. */
  onClick?: (event: MouseEvent) => void;
  /** When true, the row button is disabled. */
  disabled?: boolean;
  /** Additional CSS class — keep sunny-dashboard-thread-row for old CSS compat. */
  className?: string;
};

export function SidebarThreadItem({
  id,
  title,
  meta,
  active = false,
  contextMarker,
  menu,
  onClick,
  disabled = false,
  className,
}: SidebarThreadItemProps) {
  return (
    <div
      aria-current={active ? "page" : undefined}
      className={cn(
        "sunny-sidebar-thread-item",
        "sunny-dashboard-thread-row",
        active && "is-active",
        className,
      )}
      data-active={active || undefined}
      data-thread-id={id}
    >
      <button
        className={cn("sidebar-thread-item__main", "sunny-dashboard-thread-row-btn")}
        disabled={disabled}
        onClick={onClick}
        type="button"
      >
        <span className="sidebar-thread-item__title">{title}</span>
        {meta ? <small className="sidebar-thread-item__meta">{meta}</small> : null}
      </button>
      {contextMarker ? (
        <div className="sidebar-thread-item__marker">{contextMarker}</div>
      ) : null}
      {menu ? (
        <div className="sidebar-thread-item__menu">{menu}</div>
      ) : null}
    </div>
  );
}
