"use client";

import type { Editor } from "@tiptap/core";
import { useEffect, useRef, useState } from "react";

import { uploadDashboardImage } from "@/lib/editor/upload-dashboard-image";

type EditorToolbarProps = {
  editor: Editor | null;
  onAiAction?: (action: "continue" | "extract_tags" | "generate_outline") => void;
};

const askForHref = () => {
  if (typeof window === "undefined") {
    return null;
  }

  return window.prompt("链接地址")?.trim() || null;
};

const insertItems = [
  {
    label: "表格",
    run: (editor: Editor) =>
      editor.chain().focus().insertTable({ cols: 3, rows: 3, withHeaderRow: true }).run(),
  },
  {
    label: "Callout",
    run: (editor: Editor) =>
      editor
        .chain()
        .focus()
        .insertContent({
          attrs: { tone: "note" },
          content: [{ type: "paragraph" }],
          type: "callout",
        })
        .run(),
  },
  {
    label: "分割线",
    run: (editor: Editor) => editor.chain().focus().setHorizontalRule().run(),
  },
  {
    label: "任务列表",
    run: (editor: Editor) => editor.chain().focus().toggleTaskList().run(),
  },
  {
    label: "有序列表",
    run: (editor: Editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    label: "项目列表",
    run: (editor: Editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    label: "代码块",
    run: (editor: Editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
];

export function EditorToolbar({ editor, onAiAction }: EditorToolbarProps) {
  const [insertOpen, setInsertOpen] = useState(false);
  const insertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!insertOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!insertRef.current?.contains(event.target as Node)) {
        setInsertOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [insertOpen]);

  if (!editor) {
    return null;
  }

  const setParagraph = () => editor.chain().focus().setParagraph().run();

  return (
    <div className="sunny-rich-editor-toolbar" aria-label="编辑器工具栏">
      <select
        aria-label="文本样式"
        className="sunny-rich-editor-style-select"
        onChange={(event) => {
          const value = event.target.value;
          if (value === "paragraph") {
            setParagraph();
          } else {
            editor
              .chain()
              .focus()
              .toggleHeading({ level: Number(value) as 1 | 2 | 3 })
              .run();
          }
        }}
        value={
          editor.isActive("heading", { level: 1 })
            ? "1"
            : editor.isActive("heading", { level: 2 })
              ? "2"
              : editor.isActive("heading", { level: 3 })
                ? "3"
                : "paragraph"
        }
      >
        <option value="paragraph">正文</option>
        <option value="1">标题 1</option>
        <option value="2">标题 2</option>
        <option value="3">标题 3</option>
      </select>

      <button
        aria-pressed={editor.isActive("heading", { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        title="标题 1"
        type="button"
      >
        H1
      </button>
      <button
        aria-pressed={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        title="标题 2"
        type="button"
      >
        H2
      </button>
      <button
        aria-pressed={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        title="标题 3"
        type="button"
      >
        H3
      </button>
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
      <button
        aria-pressed={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="列表"
        type="button"
      >
        列表
      </button>
      <button
        aria-pressed={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        title="引用"
        type="button"
      >
        引用
      </button>
      <label className="sunny-rich-editor-image-action" title="插入图片">
        图片
        <input
          accept="image/*"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) {
              void uploadDashboardImage(file).then((result) => {
                editor.chain().focus().setImage({ alt: file.name, src: result.url }).run();
              });
            }
            event.currentTarget.value = "";
          }}
          type="file"
        />
      </label>

      <div className="sunny-rich-editor-insert-dropdown" ref={insertRef}>
        <button
          aria-expanded={insertOpen}
          onClick={() => setInsertOpen((value) => !value)}
          title="插入更多内容块"
          type="button"
        >
          + 插入
        </button>
        {insertOpen ? (
          <div className="sunny-rich-editor-insert-menu" role="menu">
            {insertItems.map((item) => (
              <button
                key={item.label}
                onClick={() => {
                  item.run(editor);
                  setInsertOpen(false);
                }}
                role="menuitem"
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {onAiAction ? (
        <div className="sunny-rich-editor-ai-actions">
          <button onClick={() => onAiAction("continue")} title="续写" type="button">
            续写
          </button>
          <button onClick={() => onAiAction("extract_tags")} title="提取标签" type="button">
            提取标签
          </button>
          <button onClick={() => onAiAction("generate_outline")} title="生成大纲" type="button">
            生成大纲
          </button>
        </div>
      ) : null}
    </div>
  );
}
