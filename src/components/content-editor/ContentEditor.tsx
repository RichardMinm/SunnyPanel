"use client";

import { useEffect, useMemo, useRef } from "react";

import type { JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";

import type { RichContentDocument } from "@/lib/rich-content/types";
import type { WritingAssistAction } from "@/lib/agent/prompts/writing-assist";

import { buildContentEditorExtensions } from "./editor-extensions";
import { BlockControlsOverlay } from "./BlockControlsOverlay";
import { SlashCommandList, useSlashCommandState } from "./SlashCommandList";
import type { SlashCommandHandlers } from "./slash-commands";
import { FloatingFormatMenu } from "./FloatingFormatMenu";
import { SlashCommandMenu } from "./SlashCommandMenu";
import { WritingEmptyQuickActions } from "./WritingEmptyQuickActions";

import "katex/dist/katex.min.css";

type ContentEditorProps = {
  autoFocus?: boolean;
  className?: string;
  content: RichContentDocument;
  disabled?: boolean;
  onChange: (content: RichContentDocument) => void;
  onWritingAssist?: (action: WritingAssistAction) => void;
  onWorkflowAction?: SlashCommandHandlers["onWorkflow"];
  variant?: "default" | "writing";
};

export function ContentEditor({
  autoFocus,
  className,
  content,
  disabled,
  onChange,
  onWritingAssist,
  onWorkflowAction,
  variant = "default",
}: ContentEditorProps) {
  const slashHandlers = useMemo<SlashCommandHandlers>(
    () => ({
      onWritingAssist,
      onWorkflow: onWorkflowAction,
    }),
    [onWritingAssist, onWorkflowAction],
  );

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

  const slashState = useSlashCommandState(variant === "writing" ? editor : null, slashHandlers);
  const lastAppliedContentRef = useRef<unknown>(null);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    if (content === lastAppliedContentRef.current) {
      return;
    }

    if (editor.isFocused && lastAppliedContentRef.current !== null) {
      return;
    }

    lastAppliedContentRef.current = content;
    editor.commands.setContent(content as JSONContent, { emitUpdate: false });
  }, [content, editor]);

  return (
    <div className={["sunny-content-editor", className].filter(Boolean).join(" ")}>
      {variant === "writing" ? (
        <>
          {slashState.open ? (
            <SlashCommandList
              items={slashState.items}
              onHoverIndex={slashState.setSelectedIndex}
              onSelect={slashState.selectItem}
              open={slashState.open}
              placement={slashState.placement}
              position={slashState.position}
              query={slashState.query}
              selectedIndex={slashState.selectedIndex}
            />
          ) : null}
          <div className="sunny-writing-tiptap-editor sunny-writing-editor-body">
            <EditorContent editor={editor} />
            <BlockControlsOverlay editor={editor} />
            <WritingEmptyQuickActions editor={editor} onWritingAssist={onWritingAssist} />
          </div>
        </>
      ) : (
        <>
          <FloatingFormatMenu editor={editor} />
          <SlashCommandMenu editor={editor} />
          <EditorContent editor={editor} />
        </>
      )}
    </div>
  );
}
