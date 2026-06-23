"use client";

import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";

import { cn } from "@/lib/ui/cn";

export type AppContextMenuProps = {
  children: ReactNode;
  contentClassName?: string;
  trigger: ReactNode;
};

export function AppContextMenu({ children, contentClassName, trigger }: AppContextMenuProps) {
  return (
    <ContextMenuPrimitive.Root>
      <ContextMenuPrimitive.Trigger asChild>{trigger}</ContextMenuPrimitive.Trigger>
      <ContextMenuPrimitive.Portal>
        <ContextMenuPrimitive.Content
          avoidCollisions
          className={cn("app-dropdown-content app-context-menu-content", contentClassName)}
          collisionPadding={16}
        >
          {children}
        </ContextMenuPrimitive.Content>
      </ContextMenuPrimitive.Portal>
    </ContextMenuPrimitive.Root>
  );
}

export const AppContextMenuItem = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item>
>(function AppContextMenuItem({ children, className, ...props }, ref) {
  return (
    <ContextMenuPrimitive.Item
      ref={ref}
      className={cn("app-dropdown-item app-menu-item", className)}
      {...props}
    >
      <span className="app-dropdown-item-label app-menu-item-label">{children}</span>
    </ContextMenuPrimitive.Item>
  );
});

export const AppContextMenuSeparator = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Separator>
>(function AppContextMenuSeparator({ className, ...props }, ref) {
  return (
    <ContextMenuPrimitive.Separator
      ref={ref}
      className={cn("app-dropdown-separator app-menu-separator", className)}
      {...props}
    />
  );
});

export const AppContextMenuLabel = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Label>
>(function AppContextMenuLabel({ className, ...props }, ref) {
  return <ContextMenuPrimitive.Label ref={ref} className={cn("app-menu-label", className)} {...props} />;
});
