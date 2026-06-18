"use client";

import type { Editor } from "@tiptap/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type SlashItem = {
  command: (editor: Editor) => void;
  keywords: string[];
  label: string;
};

const slashItems: SlashItem[] = [
  {
    command: (editor) => editor.chain().focus().setParagraph().run(),
    keywords: ["paragraph", "text", "正文"],
    label: "正文",
  },
  {
    command: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    keywords: ["h1", "heading", "标题"],
    label: "标题 1",
  },
  {
    command: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    keywords: ["h2", "heading", "标题"],
    label: "标题 2",
  },
  {
    command: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    keywords: ["h3", "heading", "标题"],
    label: "标题 3",
  },
  {
    command: (editor) => editor.chain().focus().toggleBulletList().run(),
    keywords: ["list", "bullet", "列表"],
    label: "项目列表",
  },
  {
    command: (editor) => editor.chain().focus().toggleOrderedList().run(),
    keywords: ["ordered", "列表"],
    label: "有序列表",
  },
  {
    command: (editor) => editor.chain().focus().toggleTaskList().run(),
    keywords: ["task", "todo", "任务"],
    label: "任务列表",
  },
  {
    command: (editor) => editor.chain().focus().toggleBlockquote().run(),
    keywords: ["quote", "引用"],
    label: "引用",
  },
  {
    command: (editor) => editor.chain().focus().toggleCodeBlock().run(),
    keywords: ["code", "代码"],
    label: "代码块",
  },
  {
    command: (editor) => editor.chain().focus().setHorizontalRule().run(),
    keywords: ["divider", "hr", "分割线"],
    label: "分割线",
  },
  {
    command: (editor) =>
      editor.chain().focus().insertTable({ cols: 3, rows: 3, withHeaderRow: true }).run(),
    keywords: ["table", "表格"],
    label: "表格",
  },
  {
    command: (editor) =>
      editor
        .chain()
        .focus()
        .insertContent({
          attrs: { tone: "note" },
          content: [{ type: "paragraph" }],
          type: "callout",
        })
        .run(),
    keywords: ["callout", "提示"],
    label: "Callout",
  },
];

type SlashCommandListProps = {
  items: SlashItem[];
  onSelect: (item: SlashItem) => void;
  position: { left: number; top: number };
  selectedIndex: number;
};

export function SlashCommandList({
  items,
  onSelect,
  position,
  selectedIndex,
}: SlashCommandListProps) {
  if (!items.length || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="sunny-rich-editor-slash-popup"
      role="listbox"
      style={{ left: position.left, top: position.top }}
    >
      {items.map((item, index) => (
        <button
          aria-selected={index === selectedIndex}
          className={index === selectedIndex ? "is-active" : ""}
          key={item.label}
          onMouseDown={(event) => {
            event.preventDefault();
            onSelect(item);
          }}
          role="option"
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}

export function filterSlashItems(query: string) {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return slashItems;
  }

  return slashItems.filter((item) => {
    const haystack = [item.label, ...item.keywords].join(" ").toLowerCase();
    return haystack.includes(normalized);
  });
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
    (item: SlashItem) => {
      if (!editor || !rangeRef.current) {
        return;
      }

      editor
        .chain()
        .focus()
        .deleteRange(rangeRef.current)
        .run();

      item.command(editor);
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
