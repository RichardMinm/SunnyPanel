"use client";

import { Slot } from "@radix-ui/react-slot";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/ui/cn";

export type AppButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "danger";
export type AppButtonSize = "sm" | "md" | "lg" | "icon" | "icon-sm" | "icon-lg";

export type AppButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  active?: boolean;
  loading?: boolean;
  size?: AppButtonSize;
  variant?: AppButtonVariant;
  children?: ReactNode;
};

const variantClass: Record<AppButtonVariant, string> = {
  primary: "app-button--primary",
  secondary: "app-button--secondary",
  ghost: "app-button--ghost",
  outline: "app-button--outline",
  danger: "app-button--danger",
};

const sizeClass: Record<AppButtonSize, string> = {
  sm: "app-button--sm",
  md: "",
  lg: "app-button--lg",
  icon: "app-button--icon",
  "icon-sm": "app-button--icon app-button--icon-sm",
  "icon-lg": "app-button--icon app-button--icon-lg",
};

export const AppButton = forwardRef<HTMLButtonElement, AppButtonProps>(function AppButton(
  {
    asChild = false,
    active = false,
    className,
    disabled,
    loading = false,
    size = "md",
    variant = "secondary",
    children,
    ...props
  },
  ref,
) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      ref={ref}
      aria-disabled={disabled || loading || undefined}
      aria-pressed={active || undefined}
      className={cn(
        "app-button",
        variantClass[variant],
        sizeClass[size],
        active && "is-active",
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <span aria-hidden="true" className="app-button__spinner" /> : null}
      {children}
    </Comp>
  );
});
