"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { AppPopover } from "@/components/primitives/AppPopover";
import { cn } from "@/lib/ui/cn";

export type AppComboboxOption = {
  id: string;
  label: string;
  description?: string;
};

export type AppComboboxProps = {
  emptyLabel?: string;
  loading?: boolean;
  loadingLabel?: string;
  onOpenChange?: (open: boolean) => void;
  onQueryChange: (query: string) => void;
  onSelect: (option: AppComboboxOption) => void;
  open?: boolean;
  options: AppComboboxOption[];
  placeholder?: string;
  query: string;
  trigger: ReactNode;
};

export function AppCombobox({
  emptyLabel = "没有匹配结果",
  loading = false,
  loadingLabel = "搜索中...",
  onOpenChange,
  onQueryChange,
  onSelect,
  open: controlledOpen,
  options,
  placeholder = "搜索...",
  query,
  trigger,
}: AppComboboxProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const open = controlledOpen ?? internalOpen;

  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- reset keyboard navigation when the combobox opens */
    if (open) {
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- reset keyboard navigation when search results change */
    setActiveIndex(0);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [query, options.length]);

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, Math.max(options.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && options[activeIndex]) {
      event.preventDefault();
      onSelect(options[activeIndex]!);
      setOpen(false);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  };

  return (
    <AppPopover
      open={open}
      onOpenChange={setOpen}
      side="bottom"
      align="start"
      collisionPadding={16}
      trigger={trigger}
      contentClassName="app-combobox-popover"
      className="app-combobox-content"
      width="min(24rem, calc(100vw - 2rem))"
    >
      <input
        ref={inputRef}
        className="app-combobox-input"
        placeholder={placeholder}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={handleInputKeyDown}
        aria-autocomplete="list"
      />
      <div className="app-combobox-list" role="listbox">
        {loading ? <div className="app-combobox-empty">{loadingLabel}</div> : null}
        {!loading && options.length === 0 ? <div className="app-combobox-empty">{emptyLabel}</div> : null}
        {!loading
          ? options.map((option, index) => (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={cn("app-menu-item", index === activeIndex && "is-active")}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => {
                  onSelect(option);
                  setOpen(false);
                }}
              >
                <span className="app-menu-item-label">
                  {option.label}
                  {option.description ? <span className="app-menu-item-description">{option.description}</span> : null}
                </span>
              </button>
            ))
          : null}
      </div>
    </AppPopover>
  );
}
