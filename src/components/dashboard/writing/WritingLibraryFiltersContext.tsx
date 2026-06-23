"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type WritingLibraryFiltersContextValue = {
  createCategoryOpen: boolean;
  draftFilter: boolean;
  searchOpen: boolean;
  setCreateCategoryOpen: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;
  showArchivedCategories: boolean;
  toggleArchivedCategories: () => void;
  toggleDraftFilter: () => void;
};

const WritingLibraryFiltersContext = createContext<WritingLibraryFiltersContextValue | null>(null);

export function WritingLibraryFiltersProvider({ children }: { children: ReactNode }) {
  const [draftFilter, setDraftFilter] = useState(false);
  const [showArchivedCategories, setShowArchivedCategories] = useState(false);
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const toggleDraftFilter = useCallback(() => {
    setDraftFilter((current) => !current);
  }, []);

  const toggleArchivedCategories = useCallback(() => {
    setShowArchivedCategories((current) => !current);
  }, []);

  return (
    <WritingLibraryFiltersContext.Provider
      value={{
        createCategoryOpen,
        draftFilter,
        searchOpen,
        setCreateCategoryOpen,
        setSearchOpen,
        showArchivedCategories,
        toggleArchivedCategories,
        toggleDraftFilter,
      }}
    >
      {children}
    </WritingLibraryFiltersContext.Provider>
  );
}

export function useWritingLibraryFiltersContext() {
  const context = useContext(WritingLibraryFiltersContext);

  if (!context) {
    throw new Error("useWritingLibraryFiltersContext must be used within WritingLibraryFiltersProvider");
  }

  return context;
}
