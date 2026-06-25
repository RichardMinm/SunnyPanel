"use client";

import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { forwardRef, type ComponentPropsWithoutRef, type MouseEvent, type ReactNode } from "react";

import { cn } from "@/lib/ui/cn";

export type AppDropdownMenuProps = {
  children: ReactNode;
  trigger: ReactNode;
  align?: "start" | "center" | "end";
  className?: string;
  collisionPadding?: number;
  modal?: boolean;
  onOpenChange?: (open: boolean) => void;
  onTriggerClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  open?: boolean;
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
  triggerAriaLabel?: string;
  triggerClassName?: string;
  triggerTitle?: string;
};

export function AppDropdownMenu({
  children,
  trigger,
  align = "start",
  className,
  collisionPadding = 16,
  modal = false,
  onOpenChange,
  onTriggerClick,
  open,
  side = "bottom",
  sideOffset = 6,
  triggerAriaLabel,
  triggerClassName,
  triggerTitle,
}: AppDropdownMenuProps) {
  return (
    <DropdownMenuPrimitive.Root modal={modal} onOpenChange={onOpenChange} open={open}>
      <DropdownMenuPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label={triggerAriaLabel}
          className={triggerClassName}
          onClick={onTriggerClick}
          title={triggerTitle}
        >
          {trigger}
        </button>
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align={align}
          avoidCollisions
          className={cn("app-dropdown-content", className)}
          collisionPadding={collisionPadding}
          side={side}
          sideOffset={sideOffset}
        >
          {children}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}

export const AppDropdownMenuItem = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    chevron?: ReactNode;
    description?: ReactNode;
    inset?: boolean;
  }
>(function AppDropdownMenuItem({ children, className, chevron, description, inset, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Item
      ref={ref}
      className={cn("app-dropdown-item app-menu-item", inset && "pl-8", className)}
      {...props}
    >
      <span className="app-dropdown-item-label app-menu-item-label">
        {children}
        {description ? <span className="app-menu-item-description">{description}</span> : null}
      </span>
      {chevron ? <span className="app-dropdown-item-chevron app-menu-item-chevron">{chevron}</span> : null}
    </DropdownMenuPrimitive.Item>
  );
});

export const AppDropdownMenuSub = DropdownMenuPrimitive.Sub;
export const AppDropdownMenuSubTrigger = DropdownMenuPrimitive.SubTrigger;
export const AppDropdownMenuSubContent = DropdownMenuPrimitive.SubContent;
export const AppDropdownMenuLabel = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>
>(function AppDropdownMenuLabel({ className, ...props }, ref) {
  return <DropdownMenuPrimitive.Label ref={ref} className={cn("app-menu-label", className)} {...props} />;
});
export const AppDropdownMenuSeparator = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(function AppDropdownMenuSeparator({ className, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Separator ref={ref} className={cn("app-dropdown-separator app-menu-separator", className)} {...props} />
  );
});
