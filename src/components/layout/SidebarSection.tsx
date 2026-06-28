"use client";

import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";
import { useEffect, useState, type ReactNode } from "react";

import { cn } from "@/lib/ui/cn";

const STORAGE_PREFIX = "sunny.sidebar.section.";

export type SidebarSectionProps = {
  actions?: ReactNode;
  "aria-label"?: string;
  children?: ReactNode;
  className?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  description?: ReactNode;
  empty?: ReactNode;
  persistKey?: string;
  title?: ReactNode;
};

export function SidebarSection({
  actions,
  "aria-label": ariaLabel,
  children,
  className,
  collapsible = false,
  defaultOpen = true,
  description,
  empty,
  persistKey,
  title,
}: SidebarSectionProps) {
  /* Resolve initial open state safely (SSR-compatible) */
  const [open, setOpen] = useState<boolean>(() => {
    if (persistKey && typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(STORAGE_PREFIX + persistKey);
        if (stored === "0") return false;
        if (stored === "1") return true;
      } catch { /* storage blocked */ }
    }
    return defaultOpen;
  });

  useEffect(() => {
    if (persistKey && typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_PREFIX + persistKey, open ? "1" : "0");
      } catch { /* storage blocked */ }
    }
  }, [open, persistKey]);

  const header = (
    <div className="app-sidebar-section__header">
      <div className="app-sidebar-section__header-main">
        {title ? <h4 className="app-sidebar-section__title">{title}</h4> : null}
        {description ? <p className="app-sidebar-section__description">{description}</p> : null}
      </div>
      {actions ? <div className="app-sidebar-section__actions">{actions}</div> : null}
    </div>
  );

  const body = (
    <div className="app-sidebar-section__body">
      {children}
      {!children && empty ? (
        <div className="app-sidebar-section__empty">{empty}</div>
      ) : null}
    </div>
  );

  if (!collapsible) {
    return (
      <div aria-label={ariaLabel} className={cn("app-sidebar-section", className)}>
        {title || description || actions ? header : null}
        {body}
      </div>
    );
  }

  return (
    <CollapsiblePrimitive.Root
      aria-label={ariaLabel}
      className={cn("app-sidebar-section", className)}
      onOpenChange={setOpen}
      open={open}
    >
      <CollapsiblePrimitive.Trigger className="app-sidebar-section__trigger">
        {header}
        <span className="app-sidebar-section__chevron" aria-hidden="true">
          <ChevronIcon />
        </span>
      </CollapsiblePrimitive.Trigger>
      <CollapsiblePrimitive.Content className="app-sidebar-section__collapsible-body">
        {body}
      </CollapsiblePrimitive.Content>
    </CollapsiblePrimitive.Root>
  );
}

function ChevronIcon() {
  return (
    <svg
      fill="none"
      height="12"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="12"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
