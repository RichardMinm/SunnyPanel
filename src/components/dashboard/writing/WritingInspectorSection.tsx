"use client";

import type { ReactNode } from "react";

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
      <summary>{title}</summary>
      <div className="sunny-writing-inspector-section-body">{children}</div>
    </details>
  );
}
