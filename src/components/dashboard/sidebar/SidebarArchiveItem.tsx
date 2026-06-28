"use client";

import { type ReactNode } from "react";

import { cn } from "@/lib/ui/cn";

export type SidebarArchiveItemProps = {
  /** Archive thread identifier, used as React key by the parent. */
  id: number | string;
  /** Archive thread title — single line truncated via CSS. */
  title: ReactNode;
  /** Optional metadata line (creation date, etc.). */
  meta?: ReactNode;
  /** Restore handler. Called with stopPropagation applied. */
  onRestore?: () => void;
  /** Delete handler. Called with stopPropagation applied. */
  onDelete?: () => void;
  /** Menu slot — typically a <ThreadRowMenu /> with custom menuItems.
   *  Rendered as sibling to the actions buttons. */
  menu?: ReactNode;
  /** When true, both restore and delete buttons are disabled. */
  disabled?: boolean;
  /** When true, restore button is disabled (e.g. mid-request). */
  restoring?: boolean;
  /** When true, delete button is disabled (e.g. mid-request). */
  deleting?: boolean;
  /** Additional CSS class — keep sunny-dashboard-archive-thread for old CSS compat. */
  className?: string;
};

export function SidebarArchiveItem({
  id,
  title,
  meta,
  onRestore,
  onDelete,
  menu,
  disabled = false,
  restoring = false,
  deleting = false,
  className,
}: SidebarArchiveItemProps) {
  return (
    <div
      className={cn(
        "sidebar-archive-item",
        "sunny-dashboard-archive-thread",
        className,
      )}
      data-archive-id={id}
    >
      <div className="sidebar-archive-item__main">
        <span className={cn("sidebar-archive-item__title", "sunny-dashboard-sidebar-label")}>
          {title}
        </span>
        {meta ? (
          <small className="sidebar-archive-item__meta">{meta}</small>
        ) : null}
      </div>
      <div
        className={cn(
          "sidebar-archive-item__actions",
          "sunny-dashboard-archive-actions",
        )}
      >
        <button
          aria-label="恢复会话"
          className={cn(
            "sidebar-archive-item__restore",
            "sunny-dashboard-archive-restore-btn",
          )}
          disabled={disabled || restoring}
          onClick={(e) => {
            e.stopPropagation();
            onRestore?.();
          }}
          type="button"
        >
          恢复
        </button>
        <button
          aria-label="删除会话"
          className={cn(
            "sidebar-archive-item__delete",
            "sunny-dashboard-archive-delete-btn",
          )}
          disabled={disabled || deleting}
          onClick={(e) => {
            e.stopPropagation();
            onDelete?.();
          }}
          type="button"
        >
          删除
        </button>
      </div>
      {menu ? (
        <div className="sidebar-archive-item__menu">{menu}</div>
      ) : null}
    </div>
  );
}
