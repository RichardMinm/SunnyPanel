"use client";

import type { ReactNode } from "react";

import { AppInspectorSection } from "@/components/primitives/AppInspectorSection";

type WritingInspectorSectionProps = {
  children: ReactNode;
  defaultOpen?: boolean;
  sectionId?: string;
  title: string;
};

export function WritingInspectorSection({
  children,
  defaultOpen = false,
  sectionId,
  title,
}: WritingInspectorSectionProps) {
  return (
    <AppInspectorSection
      defaultOpen={defaultOpen}
      persistKey={sectionId ? `writing-inspector-${sectionId}` : undefined}
      title={title}
    >
      {children}
    </AppInspectorSection>
  );
}
