"use client";

import type { Editor } from "@tiptap/core";
import { BubbleMenu } from "@tiptap/react/menus";

import { promptLinkHref } from "@/lib/editor/prompt-link";

export type EditorBubbleAiAction = "condense" | "expand" | "polish" | "rewrite" | "summarize";

export type EditorBubbleAiPayload = {
  action: EditorBubbleAiAction;
  replaceSelection: (result: string) => void;
  selectedText: string;
};

type EditorBubbleMenuProps = {
  editor: Editor | null;
  onAiAction?: (payload: EditorBubbleAiPayload) => void;
};

const askForHref = () => promptLinkHref();

export function EditorBubbleMenu({ editor, onAiAction }: EditorBubbleMenuProps) {
  if (!editor) {
    return null;
  }

  const runAi = (action: EditorBubbleAiAction) => {
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, " ").trim();

    if (selectedText && onAiAction) {
      onAiAction({
        action,
        replaceSelection: (result) => {
          if (editor.state.doc.textBetween(from, to, " ").trim() !== selectedText) {
            return;
          }

          editor.chain().focus().insertContentAt({ from, to }, result).run();
        },
        selectedText,
      });
    }
  };

  return (
    <BubbleMenu
      className="sunny-rich-editor-bubble-menu"
      editor={editor}
      shouldShow={({ editor: currentEditor }) =>
        !currentEditor.state.selection.empty && currentEditor.isEditable
      }
    >
      <button
        aria-pressed={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="加粗"
        type="button"
      >
        B
      </button>
      <button
        aria-pressed={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="斜体"
        type="button"
      >
        I
      </button>
      <button
        aria-pressed={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
        title="行内代码"
        type="button"
      >
        Code
      </button>
      <button
        aria-pressed={editor.isActive("link")}
        onClick={() => {
          const href = askForHref();
          if (href) {
            editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
          }
        }}
        title="链接"
        type="button"
      >
        Link
      </button>
      {onAiAction ? (
        <>
          <span className="sunny-rich-editor-bubble-divider" />
          <button onClick={() => runAi("rewrite")} title="改写" type="button">
            改写
          </button>
          <button onClick={() => runAi("condense")} title="精简" type="button">
            精简
          </button>
          <button onClick={() => runAi("expand")} title="扩写" type="button">
            扩写
          </button>
          <button onClick={() => runAi("polish")} title="润色" type="button">
            润色
          </button>
          <button onClick={() => runAi("summarize")} title="总结" type="button">
            总结
          </button>
        </>
      ) : null}
    </BubbleMenu>
  );
}
