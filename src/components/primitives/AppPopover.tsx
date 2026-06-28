"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";

import { cn } from "@/lib/ui/cn";

export type AppPopoverProps = {
  children: ReactNode;
  trigger: ReactNode;
  align?: "start" | "center" | "end";
  className?: string;
  collisionPadding?: number;
  contentClassName?: string;
  modal?: boolean;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
  /** When true, trigger is rendered directly as the PopoverPrimitive.Trigger child
   *  (no wrapper <button>). The trigger element must be a single element that
   *  accepts a ref. triggerClassName is ignored in this mode. */
  triggerAsChild?: boolean;
  triggerClassName?: string;
  width?: number | string;
};

export function AppPopover({
  children,
  trigger,
  align = "end",
  className,
  collisionPadding = 16,
  contentClassName,
  modal = true,
  onOpenChange,
  open,
  side = "bottom",
  sideOffset = 10,
  triggerAsChild = false,
  triggerClassName,
  width,
}: AppPopoverProps) {
  return (
    <PopoverPrimitive.Root modal={modal} onOpenChange={onOpenChange} open={open}>
      {triggerAsChild ? (
        <PopoverPrimitive.Trigger asChild>
          {trigger}
        </PopoverPrimitive.Trigger>
      ) : (
        <PopoverPrimitive.Trigger asChild>
          <button type="button" className={cn("app-popover-trigger", triggerClassName)}>
            {trigger}
          </button>
        </PopoverPrimitive.Trigger>
      )}
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align={align}
          avoidCollisions
          className={cn("app-popover-content", contentClassName, className)}
          collisionPadding={collisionPadding}
          side={side}
          sideOffset={sideOffset}
          style={width !== undefined ? { width } : undefined}
        >
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export const AppPopoverClose = PopoverPrimitive.Close;

export const AppPopoverAnchor = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof PopoverPrimitive.Anchor>
>(function AppPopoverAnchor(props, ref) {
  return <PopoverPrimitive.Anchor ref={ref} {...props} />;
});
