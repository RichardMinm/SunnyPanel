"use client";

import { type HTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/ui/cn";

export type AppBadgeTone =
  | "accent"
  | "danger"
  | "default"
  | "muted"
  | "success"
  | "warning";
export type AppBadgeSize = "sm" | "md";

export type AppBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  children?: ReactNode;
  pill?: boolean;
  size?: AppBadgeSize;
  tone?: AppBadgeTone;
};

const toneClass: Record<AppBadgeTone, string> = {
  accent: "app-badge--accent",
  danger: "app-badge--danger",
  default: "app-badge--default",
  muted: "app-badge--muted",
  success: "app-badge--success",
  warning: "app-badge--warning",
};

export function AppBadge({
  children,
  className,
  pill = true,
  size = "sm",
  tone = "default",
  ...props
}: AppBadgeProps) {
  return (
    <span
      className={cn(
        "app-badge",
        size === "md" ? "app-badge--md" : "app-badge--sm",
        toneClass[tone],
        pill && "app-badge--pill",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
