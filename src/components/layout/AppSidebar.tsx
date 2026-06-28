"use client";

import { type HTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/ui/cn";

export type AppSidebarProps = HTMLAttributes<HTMLElement> & {
  bottom?: ReactNode;
  children?: ReactNode;
  collapsed?: boolean;
  iconOnly?: boolean;
  ref?: React.Ref<HTMLElement>;
  top?: ReactNode;
};

export function AppSidebar({
  bottom,
  children,
  className,
  collapsed = false,
  iconOnly = false,
  ref,
  top,
  ...props
}: AppSidebarProps) {
  return (
    <nav
      ref={ref}
      className={cn(
        "app-sidebar",
        collapsed && "app-sidebar--collapsed",
        iconOnly && "app-sidebar--icon-only",
        className,
      )}
      {...props}
    >
      {top ? <div className="app-sidebar__top">{top}</div> : null}
      <div className="app-sidebar__body">{children}</div>
      {bottom ? <div className="app-sidebar__bottom">{bottom}</div> : null}
    </nav>
  );
}
