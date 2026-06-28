"use client";

import { Slot } from "@radix-ui/react-slot";
import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/ui/cn";

export type AppCardVariant = "default" | "quiet" | "elevated" | "interactive";
export type AppCardPadding = "none" | "sm" | "md" | "lg";

export type AppCardProps = HTMLAttributes<HTMLElement> & {
  asChild?: boolean;
  children?: ReactNode;
  padding?: AppCardPadding;
  variant?: AppCardVariant;
};

const variantClass: Record<AppCardVariant, string> = {
  default: "app-card--default",
  elevated: "app-card--elevated",
  interactive: "app-card--interactive",
  quiet: "app-card--quiet",
};

const paddingClass: Record<AppCardPadding, string> = {
  lg: "app-card--pad-lg",
  md: "app-card--pad-md",
  none: "app-card--pad-none",
  sm: "app-card--pad-sm",
};

export const AppCard = forwardRef<HTMLDivElement, AppCardProps>(function AppCard(
  {
    asChild = false,
    children,
    className,
    padding = "md",
    variant = "default",
    ...props
  },
  ref,
) {
  const Comp = asChild ? Slot : "div";

  return (
    <Comp
      ref={ref}
      className={cn("app-card", variantClass[variant], paddingClass[padding], className)}
      {...props}
    >
      {children}
    </Comp>
  );
});
