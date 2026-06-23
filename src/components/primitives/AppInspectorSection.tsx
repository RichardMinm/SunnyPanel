"use client";

import * as Collapsible from "@radix-ui/react-collapsible";
import { useEffect, useId, useState, type ReactNode } from "react";

import { cn } from "@/lib/ui/cn";

export type AppInspectorSectionProps = {
  children: ReactNode;
  defaultOpen?: boolean;
  persistKey?: string;
  title: ReactNode;
};

export function AppInspectorSection({
  children,
  defaultOpen = true,
  persistKey,
  title,
}: AppInspectorSectionProps) {
  const contentId = useId();
  const storageKey = persistKey ? `sunny-inspector-section:${persistKey}` : null;
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    const stored = window.localStorage.getItem(storageKey);
    if (stored === "open") setOpen(true);
    if (stored === "closed") setOpen(false);
  }, [storageKey]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (storageKey && typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, next ? "open" : "closed");
    }
  };

  return (
    <Collapsible.Root
      className="app-inspector-section"
      data-state={open ? "open" : "closed"}
      onOpenChange={handleOpenChange}
      open={open}
    >
      <Collapsible.Trigger className="app-inspector-section-trigger" aria-controls={contentId}>
        <span className="app-inspector-section-chevron" aria-hidden="true">
          ▾
        </span>
        <span>{title}</span>
      </Collapsible.Trigger>
      <Collapsible.Content className="app-inspector-section-body" id={contentId}>
        {children}
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

export function AppInspectorSectionGroup({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("app-inspector-section-group", className)}>{children}</div>;
}
