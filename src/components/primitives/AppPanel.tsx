"use client";

import { type HTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/ui/cn";

export type AppPanelVariant = "default" | "elevated" | "quiet";

export type AppPanelProps = HTMLAttributes<HTMLDivElement> & {
  children?: ReactNode;
  footer?: ReactNode;
  header?: ReactNode;
  variant?: AppPanelVariant;
};

const variantClass: Record<AppPanelVariant, string> = {
  default: "app-panel--default",
  elevated: "app-panel--elevated",
  quiet: "app-panel--quiet",
};

export function AppPanel({
  children,
  className,
  footer,
  header,
  variant = "default",
  ...props
}: AppPanelProps) {
  return (
    <div className={cn("app-panel", variantClass[variant], className)} {...props}>
      {header ? <div className="app-panel__header">{header}</div> : null}
      <div className="app-panel__body">{children}</div>
      {footer ? <div className="app-panel__footer">{footer}</div> : null}
    </div>
  );
}
