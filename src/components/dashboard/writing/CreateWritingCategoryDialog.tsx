"use client";

import { useState } from "react";

import { DashboardIcon } from "@/components/dashboard/icons";
import { AppDialog, AppDialogBody } from "@/components/primitives/AppDialog";
import type {
  WritingCategoryIcon,
  WritingCategoryTint,
} from "@/lib/dashboard/writing-categories/normalize";

import {
  WRITING_CATEGORY_ICON_PRESETS,
  WRITING_CATEGORY_TINT_PRESETS,
  getWritingCategoryTintVar,
  isWritingCategoryIconName,
} from "./writing-collection-meta";

type CreateWritingCategoryDialogProps = {
  busy?: boolean;
  onCancel: () => void;
  onCreate: (input: { icon: WritingCategoryIcon; title: string; tint: WritingCategoryTint }) => void;
  open: boolean;
};

export function CreateWritingCategoryDialog({
  busy = false,
  onCancel,
  onCreate,
  open,
}: CreateWritingCategoryDialogProps) {
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState<WritingCategoryIcon>("layers");
  const [tint, setTint] = useState<WritingCategoryTint>("accent");

  const handleConfirm = () => {
    const nextTitle = title.trim();
    if (!nextTitle) {
      return;
    }

    onCreate({ icon, title: nextTitle, tint });
    setTitle("");
    setIcon("layers");
    setTint("accent");
  };

  return (
    <AppDialog
      cancelLabel="取消"
      confirmLabel="创建"
      loading={busy}
      onCancel={onCancel}
      onConfirm={handleConfirm}
      open={open}
      title="新建文档集"
    >
      <AppDialogBody className="sunny-writing-create-category-dialog">
        <label className="sunny-writing-create-category-field">
          <span>名称</span>
          <input
            autoFocus
            onChange={(event) => setTitle(event.target.value)}
            placeholder="例如：主线工作、雅思复习"
            value={title}
          />
        </label>
        <fieldset className="sunny-writing-create-category-field">
          <legend>图标</legend>
          <div className="sunny-writing-create-category-grid">
            {WRITING_CATEGORY_ICON_PRESETS.map((preset) => (
              <button
                aria-pressed={icon === preset.icon}
                className="sunny-writing-create-category-chip"
                key={preset.icon}
                onClick={() => setIcon(preset.icon)}
                type="button"
              >
                <DashboardIcon name={isWritingCategoryIconName(preset.icon)} />
                <span>{preset.label}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="sunny-writing-create-category-field">
          <legend>颜色</legend>
          <div className="sunny-writing-create-category-grid is-tints">
            {WRITING_CATEGORY_TINT_PRESETS.map((preset) => (
              <button
                aria-pressed={tint === preset.tint}
                className="sunny-writing-create-category-chip is-tint"
                data-tint={preset.tint}
                key={preset.tint}
                onClick={() => setTint(preset.tint)}
                style={{
                  ["--writing-category-tint" as string]: `var(${getWritingCategoryTintVar(preset.tint)})`,
                }}
                type="button"
              >
                <span className="sunny-writing-create-category-swatch" />
                <span>{preset.label}</span>
              </button>
            ))}
          </div>
        </fieldset>
      </AppDialogBody>
    </AppDialog>
  );
}
