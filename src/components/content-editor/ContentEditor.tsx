"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Editor, JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";

import type { RichContentDocument } from "@/lib/rich-content/types";
import type { WritingAssistAction } from "@/lib/agent/prompts/writing-assist";

import { buildContentEditorExtensions } from "./editor-extensions";
import { BlockControlsOverlay } from "./BlockControlsOverlay";
import { SlashCommandList, useSlashCommandState } from "./SlashCommandList";
import type { SlashCommandHandlers } from "./slash-commands";
import type { WritingAssistSelection } from "./slash-commands";
import { FloatingFormatMenu } from "./FloatingFormatMenu";
import { SlashCommandMenu } from "./SlashCommandMenu";
import { InternalDocumentLinkDialog } from "./InternalDocumentLinkDialog";
import "katex/dist/katex.min.css";

type ContentEditorProps = {
  autoFocus?: boolean;
  className?: string;
  content: RichContentDocument;
  disabled?: boolean;
  focusSignal?: number;
  onChange: (content: RichContentDocument) => void;
  onWritingAssist?: (
    action: WritingAssistAction,
    selection?: WritingAssistSelection,
  ) => void;
  onWorkflowAction?: SlashCommandHandlers["onWorkflow"];
  variant?: "default" | "writing";
};

export function ContentEditor({
  autoFocus,
  className,
  content,
  disabled,
  focusSignal,
  onChange,
  onWritingAssist,
  onWorkflowAction,
  variant = "default",
}: ContentEditorProps) {
  const [internalLinkOpen, setInternalLinkOpen] = useState(false);
  const internalLinkEditorRef = useRef<Editor | null>(null);

  const openInternalLink = useCallback((targetEditor: Editor) => {
    internalLinkEditorRef.current = targetEditor;
    setInternalLinkOpen(true);
  }, []);

  const slashHandlers = useMemo<SlashCommandHandlers>(
    () => ({
      onInternalLink: openInternalLink,
      onWritingAssist,
      onWorkflow: onWorkflowAction,
    }),
    [onWritingAssist, onWorkflowAction, openInternalLink],
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
    if (!editor || !focusSignal) {
      return;
    }

    editor.commands.focus("start");
  }, [editor, focusSignal]);

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
          <FloatingFormatMenu editor={editor} onInternalLink={openInternalLink} />
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
          </div>
        </>
      ) : (
        <>
          <FloatingFormatMenu editor={editor} onInternalLink={openInternalLink} />
          <SlashCommandMenu editor={editor} />
          <EditorContent editor={editor} />
        </>
      )}
      <InternalDocumentLinkDialog
        onCancel={() => setInternalLinkOpen(false)}
        onSelect={(document) => {
          internalLinkEditorRef.current
            ?.chain()
            .focus()
            .insertContent({
              marks: [{ attrs: { href: document.editHref }, type: "link" }],
              text: document.title,
              type: "text",
            })
            .run();
          setInternalLinkOpen(false);
        }}
        open={internalLinkOpen}
      />
    </div>
  );
}
