"use client";

import type { Editor } from "@tiptap/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  filterSlashCommandItems,
  groupSlashCommandItems,
  slashCommandGroupLabels,
  type SlashCommandItem,
} from "./slash-commands";
import { SlashCommandIcon } from "./SlashCommandIcon";

type SlashCommandListProps = {
  items: SlashCommandItem[];
  onSelect: (item: SlashCommandItem) => void;
  position: { left: number; top: number };
  selectedIndex: number;
};

export function SlashCommandList({
  items,
  onSelect,
  position,
  selectedIndex,
}: SlashCommandListProps) {
  const groups = useMemo(() => groupSlashCommandItems(items), [items]);

  if (!items.length || typeof document === "undefined") {
    return null;
  }

  let runningIndex = 0;

  return createPortal(
    <div
      className="sunny-rich-editor-slash-popup"
      role="listbox"
      style={{ left: position.left, top: position.top }}
    >
      {groups.map((group, groupIndex) => (
        <div className="sunny-rich-editor-slash-group" key={group.group}>
          {groupIndex > 0 ? <div className="sunny-rich-editor-slash-divider" role="separator" /> : null}
          <span className="sunny-rich-editor-slash-group-label">
            {slashCommandGroupLabels[group.group]}
          </span>
          {group.items.map((item) => {
            const itemIndex = runningIndex;
            runningIndex += 1;

            return (
              <button
                aria-selected={itemIndex === selectedIndex}
                className={itemIndex === selectedIndex ? "is-active" : ""}
                key={item.id}
                onMouseDown={(event) => {
                  event.preventDefault();
                  onSelect(item);
                }}
                role="option"
                type="button"
              >
                <span aria-hidden className="sunny-rich-editor-slash-icon">
                  <SlashCommandIcon name={item.icon} />
                </span>
                <span className="sunny-rich-editor-slash-label">{item.label}</span>
                {item.shortcut ? (
                  <span className="sunny-rich-editor-slash-shortcut">{item.shortcut}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      ))}
    </div>,
    document.body,
  );
}

export function filterSlashItems(query: string) {
  return filterSlashCommandItems(query);
}

export function useSlashCommandState(editor: Editor | null) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const rangeRef = useRef<{ from: number; to: number } | null>(null);

  const items = filterSlashItems(query);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setSelectedIndex(0);
    rangeRef.current = null;
  }, []);

  const selectItem = useCallback(
    (item: SlashCommandItem) => {
      if (!editor || !rangeRef.current) {
        return;
      }

      editor.chain().focus().deleteRange(rangeRef.current).run();
      void Promise.resolve(item.command(editor));
      close();
    },
    [close, editor],
  );

  useEffect(() => {
    if (!editor) {
      return;
    }

    const updatePosition = () => {
      const { from } = editor.state.selection;
      const coords = editor.view.coordsAtPos(from);
      setPosition({ left: coords.left, top: coords.bottom + 8 });
    };

    const handleUpdate = () => {
      const { $from } = editor.state.selection;
      const textBefore = $from.parent.textBetween(
        Math.max(0, $from.parentOffset - 40),
        $from.parentOffset,
        "\n",
        "\0",
      );
      const match = /(?:^|\s)\/([^\s]*)$/.exec(textBefore);

      if (!match) {
        close();
        return;
      }

      const slashIndex = $from.pos - match[1].length - 1;
      rangeRef.current = { from: slashIndex, to: $from.pos };
      setQuery(match[1]);
      setOpen(true);
      setSelectedIndex(0);
      updatePosition();
    };

    editor.on("selectionUpdate", handleUpdate);
    editor.on("update", handleUpdate);

    return () => {
      editor.off("selectionUpdate", handleUpdate);
      editor.off("update", handleUpdate);
    };
  }, [close, editor]);

  useEffect(() => {
    if (!open || !editor) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((current) => (current + 1) % Math.max(items.length, 1));
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((current) =>
          current === 0 ? Math.max(items.length - 1, 0) : current - 1,
        );
      }

      if (event.key === "Enter") {
        const item = items[selectedIndex];
        if (item) {
          event.preventDefault();
          selectItem(item);
        }
      }

      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [close, editor, items, open, selectItem, selectedIndex]);

  return {
    close,
    items,
    open,
    position,
    selectItem,
    selectedIndex,
  };
}
