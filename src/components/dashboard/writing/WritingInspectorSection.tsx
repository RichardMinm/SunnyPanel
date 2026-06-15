"use client";

import type { ReactNode } from "react";
import { DashboardIcon } from "@/components/dashboard/icons";

type WritingInspectorSectionProps = {
  children: ReactNode;
  defaultOpen?: boolean;
  title: string;
};

export function WritingInspectorSection({
  children,
  defaultOpen = true,
  title,
}: WritingInspectorSectionProps) {
  return (
    <details className="sunny-writing-inspector-section" open={defaultOpen}>
      <summary>
        <span className="sunny-writing-inspector-chevron">
          <DashboardIcon name="chevronDown" />
        </span>
        <span>{title}</span>
      </summary>
      <div className="sunny-writing-inspector-section-body">{children}</div>
    </details>
  );
}
