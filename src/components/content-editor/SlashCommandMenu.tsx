"use client";

import type { Editor } from "@tiptap/core";

import { uploadDashboardImage } from "@/lib/editor/upload-dashboard-image";

type SlashCommandMenuProps = {
  editor: Editor | null;
};

type SlashAction = {
  label: string;
  run: (editor: Editor) => void;
};

const slashActions: SlashAction[] = [
  {
    label: "文本",
    run: (editor) => editor.chain().focus().setParagraph().run(),
  },
  {
    label: "标题 1",
    run: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    label: "标题 2",
    run: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    label: "标题 3",
    run: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    label: "项目列表",
    run: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    label: "有序列表",
    run: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    label: "任务列表",
    run: (editor) => editor.chain().focus().toggleTaskList().run(),
  },
  {
    label: "引用",
    run: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    label: "代码块",
    run: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
  {
    label: "分割线",
    run: (editor) => editor.chain().focus().setHorizontalRule().run(),
  },
  {
    label: "表格",
    run: (editor) => editor.chain().focus().insertTable({ cols: 3, rows: 3, withHeaderRow: true }).run(),
  },
  {
    label: "Callout",
    run: (editor) =>
      editor
        .chain()
        .focus()
        .insertContent({
          type: "callout",
          attrs: { tone: "note" },
          content: [{ type: "paragraph" }],
        })
        .run(),
  },
];

const uploadImage = async (editor: Editor, file: File) => {
  const result = await uploadDashboardImage(file);
  editor.chain().focus().setImage({ src: result.url, alt: file.name }).run();
};

export function SlashCommandMenu({ editor }: SlashCommandMenuProps) {
  if (!editor) {
    return null;
  }

  return (
    <div className="sunny-rich-editor-slash-menu" aria-label="插入内容">
      {slashActions.map((action) => (
        <button key={action.label} onClick={() => action.run(editor)} type="button">
          {action.label}
        </button>
      ))}
      <label className="sunny-rich-editor-image-action">
        图片
        <input
          accept="image/*"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];

            if (file) {
              void uploadImage(editor, file);
            }

            event.currentTarget.value = "";
          }}
          type="file"
        />
      </label>
    </div>
  );
}
