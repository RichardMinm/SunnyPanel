"use client";

import { AppDialog } from "@/components/primitives/AppDialog";

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
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
  variant,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <AppDialog
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
