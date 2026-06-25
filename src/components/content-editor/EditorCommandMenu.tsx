"use client";

import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";

import { DashboardIcon } from "@/components/dashboard/icons";
import {
  groupSlashCommandItems,
  slashCommandGroupLabels,
  type SlashCommandItem,
} from "./slash-commands";
import { SlashCommandIcon } from "./SlashCommandIcon";

export type EditorCommandMenuProps = {
  emptyLabel?: string;
  items: SlashCommandItem[];
  onHoverIndex: (index: number) => void;
  onSelect: (item: SlashCommandItem) => void;
  open: boolean;
  placement: "bottom-start" | "top-start";
  position: { left: number; top: number };
  query: string;
  selectedIndex: number;
};

export function EditorCommandMenu({
  emptyLabel = "没有匹配的命令",
  items,
  onHoverIndex,
  onSelect,
  open,
  placement,
  position,
  query,
  selectedIndex,
}: EditorCommandMenuProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const groups = useMemo(() => groupSlashCommandItems(items), [items]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  let runningIndex = 0;

  return createPortal(
    <div
      className={`sunny-rich-editor-slash-popup sunny-editor-command-menu is-${placement}`}
      data-query={query || undefined}
      role="listbox"
      ref={listRef}
      style={{ left: position.left, top: position.top }}
    >
      {items.length === 0 ? (
        <p className="sunny-rich-editor-slash-empty">{emptyLabel}</p>
      ) : (
        groups.map((group, groupIndex) => (
          <div className="sunny-rich-editor-slash-group" key={group.group}>
            {groupIndex > 0 ? (
              <div className="sunny-rich-editor-slash-divider" role="separator" />
            ) : null}
            <span className="sunny-rich-editor-slash-group-label">
              {slashCommandGroupLabels[group.group]}
            </span>
            {group.items.map((item) => {
              const itemIndex = runningIndex;
              runningIndex += 1;
              const isActive = itemIndex === selectedIndex;

              return (
                <button
                  aria-selected={isActive}
                  className={`sunny-editor-command-row${isActive ? " is-active" : ""}`}
                  key={item.id}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onSelect(item);
                  }}
                  onMouseEnter={() => onHoverIndex(itemIndex)}
                  ref={isActive ? activeRef : undefined}
                  role="option"
                  type="button"
                >
                  <span aria-hidden className="sunny-rich-editor-slash-icon">
                    <SlashCommandIcon name={item.icon} />
                  </span>
                  <span className="sunny-editor-command-copy">
                    <span className="sunny-rich-editor-slash-label">{item.label}</span>
                    <span className="sunny-editor-command-description">{item.description}</span>
                  </span>
                  {item.shortcut ? (
                    <span className="sunny-rich-editor-slash-shortcut">{item.shortcut}</span>
                  ) : item.badge === "chevron" ? (
                    <span aria-hidden className="sunny-editor-command-chevron">
                      <DashboardIcon name="chevronRight" />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))
      )}
    </div>,
    document.body,
  );
}
