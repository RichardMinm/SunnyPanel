"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { type ReactNode } from "react";

export type AppTooltipProps = {
  children: ReactNode;
  content: ReactNode;
  delayDuration?: number;
  side?: "top" | "right" | "bottom" | "left";
};

export function AppTooltipProvider({ children }: { children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={300} skipDelayDuration={120}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

export function AppTooltip({
  children,
  content,
  delayDuration = 300,
  side = "top",
}: AppTooltipProps) {
  return (
    <TooltipPrimitive.Root delayDuration={delayDuration}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content className="app-tooltip-content" side={side} sideOffset={6}>
          {content}
          <TooltipPrimitive.Arrow width={10} height={5} />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
