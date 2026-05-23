"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { PublicNavPendingIndicator } from "@/components/public/site-chrome/PublicNavLink";
import { isNavActive } from "@/lib/site-nav";

type PublicNavDropdownProps = {
  active: boolean;
  align?: "left" | "right";
  compact?: boolean;
  items: Array<{ href: string; label: string }>;
  label: string;
  pathname: string;
};

export function PublicNavDropdown({
  active,
  align = "left",
  compact = false,
  items,
  label,
  pathname,
}: PublicNavDropdownProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (detailsRef.current) {
      detailsRef.current.open = false;
    }
  }, [pathname]);

  return (
    <details
      ref={detailsRef}
      className={`sunny-nav-dropdown ${active ? "sunny-nav-dropdown-active" : ""} ${
        align === "right" ? "sunny-nav-dropdown-align-right" : ""
      } ${compact ? "sunny-nav-dropdown-compact" : ""}`}
    >
      <summary
        className={`sunny-nav-link sunny-nav-dropdown-trigger list-none ${
          active ? "sunny-nav-link-active" : ""
        }`}
      >
        <span>{label}</span>
        <span aria-hidden className="sunny-nav-dropdown-caret">
          ▾
        </span>
      </summary>

      <div className="sunny-nav-dropdown-panel">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            scroll={false}
            className={`sunny-nav-dropdown-item ${
              isNavActive(pathname, item.href) ? "sunny-nav-dropdown-item-active" : ""
            }`}
          >
            <span>{item.label}</span>
            <PublicNavPendingIndicator />
          </Link>
        ))}
      </div>
    </details>
  );
}
