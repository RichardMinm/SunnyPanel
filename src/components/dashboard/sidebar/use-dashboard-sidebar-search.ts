"use client";

import { useCallback, useState } from "react";

export type UseDashboardSidebarSearchReturn = {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  handleSearchChange: (value: string) => void;
  clearSearch: () => void;
  handleSearchKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
};

/**
 * Search state + handlers for the dashboard sidebar search input.
 * Pure client-side local filter — no debounce, no API calls.
 */
export function useDashboardSidebarSearch(): UseDashboardSidebarSearchReturn {
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchQuery("");
  }, []);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && searchQuery.trim()) {
        // 本地过滤已生效，预留后端搜索
      }
    },
    [searchQuery],
  );

  return {
    searchQuery,
    setSearchQuery,
    handleSearchChange,
    clearSearch,
    handleSearchKeyDown,
  };
}
