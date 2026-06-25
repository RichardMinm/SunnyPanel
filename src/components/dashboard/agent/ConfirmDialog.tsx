"use client";

import { AppDialog } from "@/components/primitives/AppDialog";

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  variant: "warning" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = "取消",
  variant,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <AppDialog
      cancelLabel={cancelLabel}
      confirmLabel={confirmLabel}
      confirmVariant={variant === "danger" ? "danger" : "primary"}
      description={message}
      loading={busy}
      onCancel={onCancel}
      onConfirm={onConfirm}
      open={open}
      title={title}
    />
  );
}
