"use client";

import { type ReactNode } from "react";

import { cn } from "@/lib/ui/cn";

export type AppEmptyStateProps = {
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  compact?: boolean;
  description?: ReactNode;
  icon?: ReactNode;
  title?: ReactNode;
};

export function AppEmptyState({
  action,
  children,
  className,
  compact = false,
  description,
  icon,
  title,
}: AppEmptyStateProps) {
  return (
    <div
      className={cn(
        "app-empty-state",
        compact && "app-empty-state--compact",
        className,
      )}
    >
      {icon ? <span className="app-empty-state__icon" aria-hidden="true">{icon}</span> : null}
      {title ? <h3 className="app-empty-state__title">{title}</h3> : null}
      {description ? (
        <p className="app-empty-state__description">{description}</p>
      ) : null}
      {children}
      {action ? <div className="app-empty-state__action">{action}</div> : null}
    </div>
  );
}
