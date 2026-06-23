"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "@/lib/ui/cn";

export type AppCommandMenuItem = {
  id: string;
  label: string;
  description?: string;
  group?: string;
  onSelect: () => void;
};

export type AppCommandMenuProps = {
  emptyLabel?: string;
  items: AppCommandMenuItem[];
  loading?: boolean;
  loadingLabel?: string;
  onClose: () => void;
  onQueryChange: (query: string) => void;
  open: boolean;
  placeholder?: string;
  query: string;
  title?: ReactNode;
};

export function AppCommandMenu({
  emptyLabel = "没有匹配结果",
  items,
  loading = false,
  loadingLabel = "搜索中...",
  onClose,
  onQueryChange,
  open,
  placeholder = "搜索...",
  query,
  title,
}: AppCommandMenuProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, items.length]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown as unknown as EventListener);
    return () => window.removeEventListener("keydown", onKeyDown as unknown as EventListener);
  }, [open, onClose]);

  if (!open) return null;

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, Math.max(items.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && items[activeIndex]) {
      event.preventDefault();
      items[activeIndex]?.onSelect();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div className="app-command-menu" role="dialog" aria-label={typeof title === "string" ? title : "命令菜单"}>
      {title ? <div className="app-menu-label">{title}</div> : null}
      <input
        ref={inputRef}
        className="app-combobox-input"
        placeholder={placeholder}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={handleInputKeyDown}
        aria-autocomplete="list"
      />
      <div className="app-command-menu-list" role="listbox">
        {loading ? <div className="app-combobox-empty">{loadingLabel}</div> : null}
        {!loading && items.length === 0 ? <div className="app-combobox-empty">{emptyLabel}</div> : null}
        {!loading
          ? items.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={cn("app-menu-item", index === activeIndex && "is-active")}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={item.onSelect}
              >
                <span className="app-menu-item-label">
                  {item.label}
                  {item.description ? <span className="app-menu-item-description">{item.description}</span> : null}
                </span>
              </button>
            ))
          : null}
      </div>
    </div>
  );
}
