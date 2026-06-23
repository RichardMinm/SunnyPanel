"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";

import { cn } from "@/lib/ui/cn";

export type AppTabsProps = {
  children: ReactNode;
  className?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  value?: string;
};

export function AppTabs({ children, className, defaultValue, onValueChange, value }: AppTabsProps) {
  return (
    <TabsPrimitive.Root
      className={cn("app-tabs", className)}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      value={value}
    >
      {children}
    </TabsPrimitive.Root>
  );
}

export const AppTabsList = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(function AppTabsList({ className, ...props }, ref) {
  return <TabsPrimitive.List ref={ref} className={cn("app-tabs-list", className)} {...props} />;
});

export const AppTabsTrigger = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(function AppTabsTrigger({ className, ...props }, ref) {
  return <TabsPrimitive.Trigger ref={ref} className={cn("app-tabs-trigger", className)} {...props} />;
});

export const AppTabsContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(function AppTabsContent({ className, ...props }, ref) {
  return <TabsPrimitive.Content ref={ref} className={cn("app-tabs-content", className)} {...props} />;
});
