"use client";

import { useWritingLayoutContext } from "./WritingLayoutContext";
import { WritingLibrary } from "./WritingLibrary";

export function WritingLibraryRail() {
  const { layout, setLibraryOpen } = useWritingLayoutContext();

  if (layout.focusMode) {
    return null;
  }

  const open = layout.libraryOpen;

  return (
    <section
      aria-label="文档集"
      className={`sunny-dashboard-sidebar-section sunny-dashboard-writing-library-section${open ? "" : " is-collapsed"}`}
    >
      <WritingLibrary
        libraryOpen={open}
        onToggle={() => setLibraryOpen(!open)}
        variant="embedded"
      />
    </section>
  );
}
