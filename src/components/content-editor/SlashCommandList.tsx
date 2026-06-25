"use client";

import type { Editor } from "@tiptap/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EditorCommandMenu } from "./EditorCommandMenu";
import {
  createSlashCommandItems,
  filterSlashCommandItems,
  type SlashCommandHandlers,
  type SlashCommandItem,
} from "./slash-commands";

const MENU_WIDTH = 340;
const MENU_MAX_HEIGHT = 420;
const VIEWPORT_PADDING = 12;

function computeMenuPosition(
  coords: { bottom: number; left: number; top: number },
  itemCount: number,
): { left: number; placement: "bottom-start" | "top-start"; top: number } {
  const estimatedHeight = Math.min(MENU_MAX_HEIGHT, Math.max(itemCount, 1) * 52 + 48);
  const spaceBelow = window.innerHeight - coords.bottom - VIEWPORT_PADDING;
  const spaceAbove = coords.top - VIEWPORT_PADDING;
  const flip = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;

  const left = Math.min(
    Math.max(VIEWPORT_PADDING, coords.left),
    window.innerWidth - MENU_WIDTH - VIEWPORT_PADDING,
  );

  if (flip) {
    return {
      left,
      placement: "top-start",
      top: Math.max(VIEWPORT_PADDING, coords.top - 8 - estimatedHeight),
    };
  }

  return {
    left,
    placement: "bottom-start",
    top: coords.bottom + 8,
  };
}

export function useSlashCommandState(
  editor: Editor | null,
  handlers: SlashCommandHandlers = {},
) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const [placement, setPlacement] = useState<"bottom-start" | "top-start">("bottom-start");
  const rangeRef = useRef<{ from: number; to: number } | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const allItems = useMemo(
    () => createSlashCommandItems(handlersRef.current),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers compared by ref
    [handlers.onWritingAssist, handlers.onWorkflow],
  );

  const items = filterSlashCommandItems(query, allItems);

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

    const updateFromEditor = () => {
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
      const nextQuery = match[1];
      setQuery(nextQuery);
      setOpen(true);
      setSelectedIndex(0);

      const coords = editor.view.coordsAtPos($from.pos);
      const filtered = filterSlashCommandItems(nextQuery, createSlashCommandItems(handlersRef.current));
      const nextPosition = computeMenuPosition(coords, filtered.length);
      setPosition({ left: nextPosition.left, top: nextPosition.top });
      setPlacement(nextPosition.placement);
    };

    editor.on("selectionUpdate", updateFromEditor);
    editor.on("update", updateFromEditor);

    return () => {
      editor.off("selectionUpdate", updateFromEditor);
      editor.off("update", updateFromEditor);
    };
  }, [close, editor]);

  useEffect(() => {
    setSelectedIndex((current) =>
      items.length === 0 ? 0 : Math.min(current, items.length - 1),
    );
  }, [items.length, query]);

  useEffect(() => {
    if (!open || !editor) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (items.length === 0) return;
        setSelectedIndex((current) => (current + 1) % items.length);
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (items.length === 0) return;
        setSelectedIndex((current) =>
          current === 0 ? items.length - 1 : current - 1,
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
    placement,
    position,
    query,
    selectItem,
    selectedIndex,
    setSelectedIndex,
  };
}

type SlashCommandListProps = {
  handlers?: SlashCommandHandlers;
  onHoverIndex: (index: number) => void;
  onSelect: (item: SlashCommandItem) => void;
  open: boolean;
  items: SlashCommandItem[];
  placement: "bottom-start" | "top-start";
  position: { left: number; top: number };
  query: string;
  selectedIndex: number;
};

export function SlashCommandList(props: SlashCommandListProps) {
  return (
    <EditorCommandMenu
      items={props.items}
      onHoverIndex={props.onHoverIndex}
      onSelect={props.onSelect}
      open={props.open}
      placement={props.placement}
      position={props.position}
      query={props.query}
      selectedIndex={props.selectedIndex}
    />
  );
}

export function filterSlashItems(query: string, handlers: SlashCommandHandlers = {}) {
  return filterSlashCommandItems(query, createSlashCommandItems(handlers));
}
