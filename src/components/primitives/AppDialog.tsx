"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { type ReactNode } from "react";

import { AppButton } from "@/components/primitives/AppButton";
import { cn } from "@/lib/ui/cn";

export type AppDialogProps = {
  cancelLabel?: string;
  children?: ReactNode;
  confirmLabel?: string;
  confirmVariant?: "primary" | "danger";
  description?: ReactNode;
  loading?: boolean;
  onCancel: () => void;
  onConfirm?: () => void;
  open: boolean;
  title: string;
};

export function AppDialog({
  cancelLabel = "取消",
  children,
  confirmLabel,
  confirmVariant = "primary",
  description,
  loading = false,
  onCancel,
  onConfirm,
  open,
  title,
}: AppDialogProps) {
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="app-dialog-overlay" />
        <DialogPrimitive.Content className="app-dialog-content" aria-describedby={description ? "app-dialog-desc" : undefined}>
          <DialogPrimitive.Title className="app-dialog-title">{title}</DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description id="app-dialog-desc" className="app-dialog-description">
              {description}
            </DialogPrimitive.Description>
          ) : null}
          {children}
          {confirmLabel ? (
            <div className="app-dialog-actions">
              <AppButton disabled={loading} onClick={onCancel} type="button" variant="secondary">
                {cancelLabel}
              </AppButton>
              <AppButton
                disabled={loading}
                loading={loading}
                onClick={onConfirm}
                type="button"
                variant={confirmVariant === "danger" ? "danger" : "primary"}
              >
                {confirmLabel}
              </AppButton>
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function AppDialogBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("app-dialog-description", className)}>{children}</div>;
}
