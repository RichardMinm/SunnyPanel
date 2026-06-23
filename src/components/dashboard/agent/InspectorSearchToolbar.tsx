"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";

export type InspectorSearchResult = {
  collection: string;
  href?: string;
  id: number;
  title: string;
};

type InspectorSearchToolbarProps = {
  children: ReactNode;
  onQueryChange: (query: string) => void;
  onSearchOpenChange: (open: boolean) => void;
  query: string;
  results: InspectorSearchResult[];
  searchOpen: boolean;
  searching: boolean;
};

export function InspectorSearchToolbar({
  children,
  onQueryChange,
  onSearchOpenChange,
  query,
  results,
  searchOpen,
  searching,
}: InspectorSearchToolbarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!searchOpen) return;
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [searchOpen]);

  const handleToggleSearch = useCallback(() => {
    onSearchOpenChange(!searchOpen);
  }, [onSearchOpenChange, searchOpen]);

  const handleClearQuery = useCallback(() => {
    onQueryChange("");
  }, [onQueryChange]);

  useEffect(() => {
    if (!searchOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onSearchOpenChange(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onSearchOpenChange, searchOpen]);

  return (
    <div className="sunny-dashboard-inspector-toolbar">
      <div
        className="sunny-inspector-tab-bar sunny-agent-inspector-tabs sunny-dashboard-right-tabs"
        role="toolbar"
        aria-label="检查器工具栏"
      >
        <div className="sunny-inspector-tab-list" role="tablist" aria-label="上下文面板导航">
          {children}
        </div>
        <span className="sunny-inspector-tab-divider" aria-hidden="true" />
        <button
          type="button"
          className={searchOpen ? "is-active" : ""}
          aria-label="搜索关联对象"
          aria-expanded={searchOpen}
          title="搜索关联对象"
          onClick={handleToggleSearch}
        >
          <DashboardIcon name="search" />
        </button>
      </div>
      {searchOpen ? (
        <div className="sunny-dashboard-inspector-search">
          <div className="sunny-dashboard-search-wrapper">
            <span className="sunny-dashboard-inspector-search-icon" aria-hidden="true">
              <DashboardIcon name="search" />
            </span>
            <input
              ref={inputRef}
              type="text"
              className="sunny-dashboard-sidebar-search-input"
              placeholder="搜索关联的计划、日程、笔记..."
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              aria-label="搜索关联对象"
            />
            {query ? (
              <button
                type="button"
                className="sunny-dashboard-sidebar-search-clear"
                onClick={handleClearQuery}
                aria-label="清除搜索"
              >
                ×
              </button>
            ) : null}
          </div>
          {query.trim() && results.length > 0 ? (
            <ul className="sunny-dashboard-inspector-search-results">
              {results.map((result, index) => (
                <li key={`${result.collection}-${result.id}-${index}`}>
                  <button
                    type="button"
                    onClick={() => {
                      if (result.href) window.open(result.href, "_blank");
                    }}
                  >
                    <span>{result.title}</span>
                    <small>{result.collection}</small>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {query.trim() && !searching && results.length === 0 ? (
            <p className="sunny-dashboard-inspector-search-empty">未找到匹配结果</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
