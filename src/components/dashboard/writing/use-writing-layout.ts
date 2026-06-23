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
  inspectorOpen: false,
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
    const wasFocusMode = parsed.focusMode === true;

    // Focus/preview are session-only; stale persisted focus mode hides the library after reload.
    return {
      focusMode: false,
      previewMode: false,
      inspectorOpen: wasFocusMode ? defaultLayout.inspectorOpen : parsed.inspectorOpen !== false,
      inspectorPinned: parsed.inspectorPinned === true,
      libraryOpen: wasFocusMode ? defaultLayout.libraryOpen : parsed.libraryOpen !== false,
      libraryPinned: parsed.libraryPinned === true,
    };
  } catch {
    return defaultLayout;
  }
};

const persistLayout = (layout: WritingLayoutState, preFocus: null | WritingLayoutState) => {
  if (typeof window === "undefined") {
    return;
  }

  const stored: Omit<WritingLayoutState, "focusMode" | "previewMode"> & {
    focusMode?: never;
    previewMode?: never;
  } = {
    inspectorOpen: layout.focusMode && preFocus ? preFocus.inspectorOpen : layout.inspectorOpen,
    inspectorPinned: layout.inspectorPinned,
    libraryOpen: layout.focusMode && preFocus ? preFocus.libraryOpen : layout.libraryOpen,
    libraryPinned: layout.libraryPinned,
  };

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
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

      persistLayout(next, preFocusLayout.current);
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
