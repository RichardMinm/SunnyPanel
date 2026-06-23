"use client";

import { DashboardIcon } from "@/components/dashboard/icons";

import { useWritingLayoutContext } from "./WritingLayoutContext";
import { WritingLibrary } from "./WritingLibrary";

export function WritingLibraryRail() {
  const { layout, setLibraryOpen } = useWritingLayoutContext();

  if (layout.focusMode) {
    return null;
  }

  return (
    <section
      aria-label="内容库"
      className={`sunny-dashboard-sidebar-section sunny-dashboard-writing-library-section${layout.libraryOpen ? "" : " is-collapsed"}`}
    >
      {!layout.libraryOpen ? (
        <button
          aria-expanded={false}
          className="sunny-dashboard-sidebar-collapse-toggle"
          onClick={() => setLibraryOpen(true)}
          type="button"
        >
          <span className="sunny-sidebar-fold-arrow" data-open={false}>
            <DashboardIcon name="chevronDown" />
          </span>
          <span className="sunny-dashboard-sidebar-icon">
            <DashboardIcon name="pencil" />
          </span>
          <span className="sunny-dashboard-sidebar-label">内容库</span>
        </button>
      ) : (
        <WritingLibrary onClose={() => setLibraryOpen(false)} variant="embedded" />
      )}
    </section>
  );
}
