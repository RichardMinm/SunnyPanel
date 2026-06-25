"use client";

import type { Editor } from "@tiptap/core";

import type { WritingAssistAction } from "@/lib/agent/prompts/writing-assist";

import { createSlashCommandItems } from "./slash-commands";

type WritingEmptyQuickActionsProps = {
  editor: Editor | null;
  onWritingAssist?: (action: WritingAssistAction) => void;
};

const QUICK_ITEMS = [
  { id: "heading-1", label: "标题" },
  { id: "task-list-common", label: "任务列表" },
  { id: "quote", label: "引用" },
] as const;

export function WritingEmptyQuickActions({
  editor,
  onWritingAssist,
}: WritingEmptyQuickActionsProps) {
  if (!editor || !editor.isEmpty) {
    return null;
  }

  const items = createSlashCommandItems({ onWritingAssist });
  const run = (id: string) => {
    const item = items.find((entry) => entry.id === id);
    if (item) {
      void Promise.resolve(item.command(editor));
    }
  };

  return (
    <div className="sunny-writing-empty-quick-actions">
      <span className="sunny-writing-quick-label">常用：</span>
      {QUICK_ITEMS.map((item) => (
        <button
          className="sunny-writing-quick-chip"
          key={item.id}
          onClick={() => run(item.id)}
          type="button"
        >
          {item.label}
        </button>
      ))}
      <button
        className="sunny-writing-quick-chip"
        onClick={() => onWritingAssist?.("continue")}
        type="button"
      >
        AI 续写
      </button>
    </div>
  );
}
