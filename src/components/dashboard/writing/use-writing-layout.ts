"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "sunny-writing-layout";

export type WritingLayoutState = {
  focusMode: boolean;
  inspectorOpen: boolean;
  inspectorPinned: boolean;
  libraryOpen: boolean;
  libraryPinned: boolean;
  previewMode: boolean;
};

const defaultLayout: WritingLayoutState = {
  focusMode: false,
  inspectorOpen: true,
  inspectorPinned: false,
  libraryOpen: true,
  libraryPinned: false,
  previewMode: false,
};

const readStoredLayout = (): WritingLayoutState => {
  if (typeof window === "undefined") {
    return defaultLayout;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return defaultLayout;
    }

    const parsed = JSON.parse(raw) as Partial<WritingLayoutState>;

    return {
      focusMode: parsed.focusMode === true,
      inspectorOpen: parsed.inspectorOpen !== false,
      inspectorPinned: parsed.inspectorPinned === true,
      libraryOpen: parsed.libraryOpen !== false,
      libraryPinned: parsed.libraryPinned === true,
      previewMode: parsed.previewMode === true,
    };
  } catch {
    return defaultLayout;
  }
};

const persistLayout = (layout: WritingLayoutState) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
};

export function useWritingLayout() {
  const [layout, setLayout] = useState<WritingLayoutState>(defaultLayout);
  const preFocusLayout = useRef<null | WritingLayoutState>(null);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- hydrate layout preferences from localStorage */
    setLayout(readStoredLayout());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const updateLayout = useCallback((patch: Partial<WritingLayoutState>) => {
    setLayout((current) => {
      const next = { ...current, ...patch };

      if (patch.focusMode === true) {
        // Save pre-focus state before collapsing everything
        if (preFocusLayout.current === null) {
          preFocusLayout.current = {
            ...current,
            focusMode: false,
          };
        }
        next.libraryOpen = false;
        next.inspectorOpen = false;
        next.previewMode = false;
      }

      if (patch.focusMode === false && preFocusLayout.current) {
        // Restore pre-focus layout
        next.libraryOpen = preFocusLayout.current.libraryOpen;
        next.inspectorOpen = preFocusLayout.current.inspectorOpen;
        next.inspectorPinned = preFocusLayout.current.inspectorPinned;
        preFocusLayout.current = null;
      }

      if (patch.previewMode === true) {
        next.inspectorOpen = false;
      }

      persistLayout(next);
      return next;
    });
  }, []);

  const setLibraryOpen = useCallback(
    (libraryOpen: boolean) => updateLayout({ libraryOpen }),
    [updateLayout],
  );

  const setInspectorOpen = useCallback(
    (inspectorOpen: boolean) => updateLayout({ inspectorOpen }),
    [updateLayout],
  );

  const setInspectorPinned = useCallback(
    (inspectorPinned: boolean) => updateLayout({ inspectorPinned }),
    [updateLayout],
  );

  const setLibraryPinned = useCallback(
    (libraryPinned: boolean) => updateLayout({ libraryPinned }),
    [updateLayout],
  );

  const setFocusMode = useCallback(
    (focusMode: boolean) => updateLayout({ focusMode }),
    [updateLayout],
  );

  const setPreviewMode = useCallback(
    (previewMode: boolean) => updateLayout({ previewMode }),
    [updateLayout],
  );

  const toggleFocusMode = useCallback(() => {
    updateLayout({ focusMode: !layout.focusMode });
  }, [layout.focusMode, updateLayout]);

  const togglePreviewMode = useCallback(() => {
    updateLayout({
      previewMode: !layout.previewMode,
      focusMode: false,
    });
  }, [layout.previewMode, updateLayout]);

  return {
    layout,
    setFocusMode,
    setInspectorOpen,
    setInspectorPinned,
    setLibraryOpen,
    setLibraryPinned,
    setPreviewMode,
    toggleFocusMode,
    togglePreviewMode,
    updateLayout,
  };
}
