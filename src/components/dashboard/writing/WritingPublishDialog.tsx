"use client";

import { useEffect, useState } from "react";

import { AppDialog, AppDialogBody } from "@/components/primitives/AppDialog";

export type WritingPublishVisibility = "private" | "public";

type WritingPublishDialogProps = {
  busy?: boolean;
  collectionLabel: string;
  onCancel: () => void;
  onConfirm: (visibility: WritingPublishVisibility) => void;
  open: boolean;
};

export function WritingPublishDialog({
  busy = false,
  collectionLabel,
  onCancel,
  onConfirm,
  open,
}: WritingPublishDialogProps) {
  const [visibility, setVisibility] = useState<WritingPublishVisibility>("public");

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- reset the dialog choice each time the publish dialog opens */
    if (open) {
      setVisibility("public");
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open]);

  return (
    <AppDialog
      cancelLabel="取消"
      confirmLabel="确认发布"
      description={`选择「${collectionLabel}」发布后的可见范围。`}
      loading={busy}
      onCancel={onCancel}
      onConfirm={() => onConfirm(visibility)}
      open={open}
      title="发布内容"
    >
      <AppDialogBody className="sunny-writing-publish-dialog">
        <label className="sunny-writing-publish-option">
          <input
            checked={visibility === "public"}
            name="publish-visibility"
            onChange={() => setVisibility("public")}
            type="radio"
            value="public"
          />
          <span>
            <strong>公开发布</strong>
            <small>出现在首页与公开列表，所有人可见</small>
          </span>
        </label>
        <label className="sunny-writing-publish-option">
          <input
            checked={visibility === "private"}
            name="publish-visibility"
            onChange={() => setVisibility("private")}
            type="radio"
            value="private"
          />
          <span>
            <strong>仅自己可见</strong>
            <small>标记为已发布，但不对外展示</small>
          </span>
        </label>
      </AppDialogBody>
    </AppDialog>
  );
}
