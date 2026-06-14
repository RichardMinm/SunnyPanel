"use client";

import { useEffect } from "react";

import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
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

import { FloatingFormatMenu } from "./FloatingFormatMenu";
import { SlashCommandMenu } from "./SlashCommandMenu";
import { Callout } from "./extensions/callout";
import { PasteImageUpload } from "./extensions/image-upload";
import { StableBlockId } from "./extensions/stable-block-id";

type ContentEditorProps = {
  autoFocus?: boolean;
  className?: string;
  content: RichContentDocument;
  disabled?: boolean;
  onChange: (content: RichContentDocument) => void;
};

const editorExtensions = [
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

export function ContentEditor({ autoFocus, className, content, disabled, onChange }: ContentEditorProps) {
  const editor = useEditor({
    autofocus: autoFocus ? "end" : false,
    content: content as JSONContent,
    editable: !disabled,
    editorProps: {
      attributes: {
        class: "sunny-rich-editor-content sunny-rich-content",
      },
    },
    extensions: editorExtensions,
    immediatelyRender: false,
    onUpdate: ({ editor: nextEditor }) => {
      onChange(nextEditor.getJSON() as RichContentDocument);
    },
  });

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
      <FloatingFormatMenu editor={editor} />
      <SlashCommandMenu editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
