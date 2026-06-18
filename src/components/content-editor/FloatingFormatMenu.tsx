"use client";

import type { Editor } from "@tiptap/core";

import { promptLinkHref } from "@/lib/editor/prompt-link";

type FloatingFormatMenuProps = {
  editor: Editor | null;
};

const askForHref = () => promptLinkHref();

export function FloatingFormatMenu({ editor }: FloatingFormatMenuProps) {
  if (!editor) {
    return null;
  }

  return (
    <div className="sunny-rich-editor-floating-menu" aria-label="文本格式">
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
        aria-pressed={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        title="删除线"
        type="button"
      >
        S
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
    </div>
  );
}
