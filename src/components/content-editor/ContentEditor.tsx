"use client";

import { useEffect } from "react";

import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import Typography from "@tiptap/extension-typography";
import type { JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

import type { RichContentDocument } from "@/lib/rich-content/types";

import { EditorBubbleMenu, type EditorBubbleAiPayload } from "./EditorBubbleMenu";
import { EditorToolbar } from "./EditorToolbar";
import { SlashCommandList, useSlashCommandState } from "./SlashCommandList";
import { Callout } from "./extensions/callout";
import { PasteImageUpload } from "./extensions/image-upload";
import { StableBlockId } from "./extensions/stable-block-id";
import { FloatingFormatMenu } from "./FloatingFormatMenu";
import { SlashCommandMenu } from "./SlashCommandMenu";

type ContentEditorProps = {
  autoFocus?: boolean;
  className?: string;
  content: RichContentDocument;
  disabled?: boolean;
  onAiBubbleAction?: (payload: EditorBubbleAiPayload) => void;
  onAiToolbarAction?: (action: "continue" | "extract_tags" | "generate_outline" | "generate_summary") => void;
  onChange: (content: RichContentDocument) => void;
  variant?: "default" | "writing";
};

const defaultExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
  }),
  Link.configure({ openOnClick: false }),
  Image.configure({ allowBase64: false }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Table.configure({ resizable: true }),
  TableRow,
  TableHeader,
  TableCell,
  Typography,
  Callout,
  StableBlockId,
  PasteImageUpload,
];

const writingExtensions = [
  ...defaultExtensions,
  Placeholder.configure({
    placeholder: "开始写作，或输入 / 插入内容块",
  }),
];

export function ContentEditor({
  autoFocus,
  className,
  content,
  disabled,
  onAiBubbleAction,
  onAiToolbarAction,
  onChange,
  variant = "default",
}: ContentEditorProps) {
  const editor = useEditor({
    autofocus: autoFocus ? "end" : false,
    content: content as JSONContent,
    editable: !disabled,
    editorProps: {
      attributes: {
        class: "sunny-rich-editor-content sunny-rich-content",
      },
    },
    extensions: variant === "writing" ? writingExtensions : defaultExtensions,
    immediatelyRender: false,
    onUpdate: ({ editor: nextEditor }) => {
      onChange(nextEditor.getJSON() as RichContentDocument);
    },
  });

  const slashState = useSlashCommandState(variant === "writing" ? editor : null);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const current = JSON.stringify(editor.getJSON());
    const next = JSON.stringify(content);

    if (current !== next) {
      editor.commands.setContent(content as JSONContent, { emitUpdate: false });
    }
  }, [content, editor]);

  return (
    <div className={["sunny-content-editor", className].filter(Boolean).join(" ")}>
      {variant === "writing" ? (
        <>
          <EditorToolbar editor={editor} onAiAction={onAiToolbarAction} />
          <EditorBubbleMenu editor={editor} onAiAction={onAiBubbleAction} />
          {slashState.open ? (
            <SlashCommandList
              items={slashState.items}
              onSelect={slashState.selectItem}
              position={slashState.position}
              selectedIndex={slashState.selectedIndex}
            />
          ) : null}
        </>
      ) : (
        <>
          <FloatingFormatMenu editor={editor} />
          <SlashCommandMenu editor={editor} />
        </>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
