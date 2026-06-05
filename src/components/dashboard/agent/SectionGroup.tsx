"use client";

import { useState, type ReactNode } from "react";

type SectionGroupProps = {
  children: ReactNode;
  count?: number;
  defaultCollapsed?: boolean;
  title: string;
};

export function SectionGroup({
  children,
  count,
  defaultCollapsed = false,
  title,
}: SectionGroupProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <section className="sunny-section-group">
      <button
        type="button"
        className="sunny-section-group-head"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((value) => !value)}
      >
        <span>{title}</span>
        {typeof count === "number" ? <small>{count}</small> : null}
      </button>
      {!collapsed ? <div className="sunny-section-group-body">{children}</div> : null}
    </section>
  );
}
