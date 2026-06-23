"use client";

import { useEffect } from "react";

import type { JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";

import type { RichContentDocument } from "@/lib/rich-content/types";

import { buildContentEditorExtensions } from "./editor-extensions";
import { EditorBubbleMenu, type EditorBubbleAiPayload } from "./EditorBubbleMenu";
import { SlashCommandList, useSlashCommandState } from "./SlashCommandList";
import { FloatingFormatMenu } from "./FloatingFormatMenu";
import { SlashCommandMenu } from "./SlashCommandMenu";

import "katex/dist/katex.min.css";

type ContentEditorProps = {
  autoFocus?: boolean;
  className?: string;
  content: RichContentDocument;
  disabled?: boolean;
  onAiBubbleAction?: (payload: EditorBubbleAiPayload) => void;
  onChange: (content: RichContentDocument) => void;
  variant?: "default" | "writing";
};

export function ContentEditor({
  autoFocus,
  className,
  content,
  disabled,
  onAiBubbleAction,
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
    extensions:
      variant === "writing"
        ? buildContentEditorExtensions({ placeholder: "开始写作，或输入 / 插入内容块" })
        : buildContentEditorExtensions(),
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
