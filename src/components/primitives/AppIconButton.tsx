"use client";

import { forwardRef, type ReactNode } from "react";

import { AppButton, type AppButtonProps } from "@/components/primitives/AppButton";
import { AppTooltip } from "@/components/primitives/AppTooltip";

export type AppIconButtonProps = Omit<AppButtonProps, "size" | "children"> & {
  "aria-label": string;
  icon: ReactNode;
  size?: "sm" | "md" | "lg";
  tooltip?: string;
};

export const AppIconButton = forwardRef<HTMLButtonElement, AppIconButtonProps>(function AppIconButton(
  { icon, size = "md", tooltip, "aria-label": ariaLabel, ...props },
  ref,
) {
  const iconSize = size === "sm" ? "icon-sm" : size === "lg" ? "icon-lg" : "icon";
  const button = (
    <AppButton ref={ref} aria-label={ariaLabel} size={iconSize} variant="ghost" {...props}>
      {icon}
    </AppButton>
  );

  if (!tooltip) {
    return button;
  }

  return (
    <AppTooltip content={tooltip}>
      {button}
    </AppTooltip>
  );
});
