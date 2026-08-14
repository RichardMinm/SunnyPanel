"use client";

import type { Editor } from "@tiptap/core";
import { BubbleMenu } from "@tiptap/react/menus";

import { promptLinkHref } from "@/lib/editor/prompt-link";

type FloatingFormatMenuProps = {
  editor: Editor | null;
  onInternalLink?: (editor: Editor) => void;
};

const askForHref = () => promptLinkHref();

export function FloatingFormatMenu({ editor, onInternalLink }: FloatingFormatMenuProps) {
  if (!editor) {
    return null;
  }

  return (
    <BubbleMenu
      aria-label="文本格式"
      className="sunny-rich-editor-floating-menu"
      editor={editor}
      options={{
        flip: true,
        offset: 8,
        placement: "top",
        shift: { padding: 8 },
      }}
      shouldShow={({ editor: currentEditor, from, to }) =>
        currentEditor.isEditable && from !== to && !currentEditor.isActive("codeBlock")
      }
      updateDelay={80}
    >
      <button
        aria-label="加粗"
        aria-pressed={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="加粗"
        type="button"
      >
        B
      </button>
      <button
        aria-label="斜体"
        aria-pressed={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="斜体"
        type="button"
      >
        I
      </button>
      <button
        aria-label="删除线"
        aria-pressed={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        title="删除线"
        type="button"
      >
        S
      </button>
      <button
        aria-label="下划线"
        aria-pressed={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        title="下划线"
        type="button"
      >
        U
      </button>
      <button
        aria-label="高亮"
        aria-pressed={editor.isActive("highlight")}
        onClick={() => editor.chain().focus().toggleMark("highlight").run()}
        title="高亮"
        type="button"
      >
        高亮
      </button>
      <button
        aria-label="行内代码"
        aria-pressed={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
        title="行内代码"
        type="button"
      >
        代码
      </button>
      <button
        aria-label="添加链接"
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
        链接
      </button>
      {onInternalLink ? (
        <button
          aria-label="链接到文档"
          onClick={() => onInternalLink(editor)}
          title="链接到文档"
          type="button"
        >
          文档
        </button>
      ) : null}
    </BubbleMenu>
  );
}
