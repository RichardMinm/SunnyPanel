"use client";

import { type HTMLAttributes, type ReactNode } from "react";

import { AppIconButton } from "@/components/primitives/AppIconButton";
import { cn } from "@/lib/ui/cn";

export type InspectorPanelProps = HTMLAttributes<HTMLElement> & {
  actions?: ReactNode;
  /** Render as bare inner <div> for embedded content use — omits shell styles,
   *  fixed width, border, and background. Internal head/body structure is kept. */
  bare?: boolean;
  children?: ReactNode;
  collapsed?: boolean;
  footer?: ReactNode;
  subtitle?: ReactNode;
  tabs?: ReactNode;
  title?: ReactNode;
  width?: number | string;
};

export function InspectorPanel({
  actions,
  bare = false,
  children,
  className,
  collapsed = false,
  footer,
  subtitle,
  tabs,
  title,
  width,
  ...props
}: InspectorPanelProps) {
  const inner = (
    <>
      {title || actions ? (
        <div className="app-inspector-panel__head">
          <div className="app-inspector-panel__title-row">
            <div className="app-inspector-panel__title-group">
              {title ? <h3 className="app-inspector-panel__title">{title}</h3> : null}
              {subtitle ? <p className="app-inspector-panel__subtitle">{subtitle}</p> : null}
            </div>
            {actions ? (
              <div className="app-inspector-panel__head-actions">{actions}</div>
            ) : null}
          </div>
          {tabs ? <div className="app-inspector-panel__tabs">{tabs}</div> : null}
        </div>
      ) : null}
      <div className="app-inspector-panel__body">{children}</div>
      {footer ? <div className="app-inspector-panel__footer">{footer}</div> : null}
    </>
  );

  if (bare) {
    return (
      <div className={cn(className)} {...(props as HTMLAttributes<HTMLDivElement>)}>
        {inner}
      </div>
    );
  }

  return (
    <aside
      className={cn(
        "app-inspector-panel",
        collapsed && "app-inspector-panel--collapsed",
        className,
      )}
      style={width !== undefined ? { width, minWidth: width, maxWidth: width } : undefined}
      {...(props as HTMLAttributes<HTMLElement>)}
    >
      {inner}
    </aside>
  );
}

export { AppIconButton };
