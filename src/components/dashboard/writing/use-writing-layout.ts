"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "sunny-writing-layout";

export type WritingLayoutState = {
  focusMode: boolean;
  inspectorOpen: boolean;
  libraryOpen: boolean;
  previewMode: boolean;
};

const defaultLayout: WritingLayoutState = {
  focusMode: false,
  inspectorOpen: true,
  libraryOpen: true,
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
      libraryOpen: parsed.libraryOpen !== false,
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

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- hydrate layout preferences from localStorage */
    setLayout(readStoredLayout());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const updateLayout = useCallback((patch: Partial<WritingLayoutState>) => {
    setLayout((current) => {
      const next = { ...current, ...patch };

      if (patch.focusMode === true) {
        next.libraryOpen = false;
        next.inspectorOpen = false;
        next.previewMode = false;
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

  const setFocusMode = useCallback(
    (focusMode: boolean) => updateLayout({ focusMode }),
    [updateLayout],
  );

  const setPreviewMode = useCallback(
    (previewMode: boolean) => updateLayout({ previewMode }),
    [updateLayout],
  );

  const toggleFocusMode = useCallback(() => {
    setLayout((current) => {
      const nextFocus = !current.focusMode;
      const next: WritingLayoutState = {
        ...current,
        focusMode: nextFocus,
        inspectorOpen: nextFocus ? false : true,
        libraryOpen: nextFocus ? false : true,
        previewMode: false,
      };

      persistLayout(next);
      return next;
    });
  }, []);

  const togglePreviewMode = useCallback(() => {
    setLayout((current) => {
      const nextPreview = !current.previewMode;
      const next: WritingLayoutState = {
        ...current,
        previewMode: nextPreview,
        focusMode: false,
        inspectorOpen: nextPreview ? false : current.inspectorOpen,
      };

      persistLayout(next);
      return next;
    });
  }, []);

  return {
    layout,
    setFocusMode,
    setInspectorOpen,
    setLibraryOpen,
    setPreviewMode,
    toggleFocusMode,
    togglePreviewMode,
    updateLayout,
  };
}
