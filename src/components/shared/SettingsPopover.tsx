"use client";

import { type ReactNode } from "react";

import { AppPopover } from "@/components/primitives/AppPopover";

export type SettingsPopoverProps = {
  children: ReactNode;
  trigger: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  triggerAsChild?: boolean;
  triggerClassName?: string;
};

export function SettingsPopover({
  children,
  trigger,
  open,
  onOpenChange,
  triggerAsChild = false,
  triggerClassName = "settings-popover-trigger",
}: SettingsPopoverProps) {
  return (
    <AppPopover
      align="end"
      collisionPadding={16}
      contentClassName="settings-popover"
      onOpenChange={onOpenChange}
      open={open}
      side="bottom"
      sideOffset={10}
      trigger={trigger}
      triggerAsChild={triggerAsChild}
      triggerClassName={triggerClassName}
      width="var(--settings-width, 360px)"
    >
      {children}
    </AppPopover>
  );
}
