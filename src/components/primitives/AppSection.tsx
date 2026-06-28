"use client";

import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";
import { useEffect, useState, type ReactNode } from "react";

import { cn } from "@/lib/ui/cn";

export type AppSectionProps = {
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  description?: ReactNode;
  persistKey?: string;
  title?: ReactNode;
};

export function AppSection({
  actions,
  children,
  className,
  collapsible = false,
  defaultOpen = true,
  description,
  persistKey,
  title,
}: AppSectionProps) {
  const [open, setOpen] = useState(() => {
    if (persistKey && typeof window !== "undefined") {
      const stored = localStorage.getItem(`app-section-${persistKey}`);
      if (stored !== null) return stored === "1";
    }
    return defaultOpen;
  });

  useEffect(() => {
    if (persistKey) {
      localStorage.setItem(`app-section-${persistKey}`, open ? "1" : "0");
    }
  }, [open, persistKey]);

  const header = (
    <div className="app-section__header">
      <div className="app-section__header-main">
        {title ? <h4 className="app-section__title">{title}</h4> : null}
        {description ? <p className="app-section__description">{description}</p> : null}
      </div>
      {actions ? <div className="app-section__actions">{actions}</div> : null}
    </div>
  );

  if (!collapsible) {
    return (
      <div className={cn("app-section", className)}>
        {title || description || actions ? header : null}
        <div className="app-section__body">{children}</div>
      </div>
    );
  }

  return (
    <CollapsiblePrimitive.Root
      className={cn("app-section", "app-section--collapsible", className)}
      onOpenChange={setOpen}
      open={open}
    >
      <CollapsiblePrimitive.Trigger className="app-section__trigger">
        {header}
        <span className="app-section__chevron" aria-hidden="true">
          <ChevronIcon />
        </span>
      </CollapsiblePrimitive.Trigger>
      <CollapsiblePrimitive.Content className="app-section__collapsible-body">
        <div className="app-section__body">{children}</div>
      </CollapsiblePrimitive.Content>
    </CollapsiblePrimitive.Root>
  );
}

function ChevronIcon() {
  return (
    <svg
      fill="none"
      height="14"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="14"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
