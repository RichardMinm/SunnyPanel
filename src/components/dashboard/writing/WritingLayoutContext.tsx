"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";

import { useWritingLayout } from "./use-writing-layout";

type WritingLayoutContextValue = ReturnType<typeof useWritingLayout>;

const WritingLayoutContext = createContext<WritingLayoutContextValue | null>(null);

export function WritingLayoutProvider({
  children,
  onFocusModeChange,
}: {
  children: ReactNode;
  onFocusModeChange?: (focusMode: boolean) => void;
}) {
  const value = useWritingLayout();

  useEffect(() => {
    onFocusModeChange?.(value.layout.focusMode);
  }, [onFocusModeChange, value.layout.focusMode]);

  return (
    <WritingLayoutContext.Provider value={value}>{children}</WritingLayoutContext.Provider>
  );
}

export function useWritingLayoutContext() {
  const context = useContext(WritingLayoutContext);

  if (!context) {
    throw new Error("useWritingLayoutContext must be used within WritingLayoutProvider");
  }

  return context;
}
