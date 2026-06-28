"use client";

import { forwardRef, type TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/ui/cn";

export type AppTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean;
};

export const AppTextarea = forwardRef<HTMLTextAreaElement, AppTextareaProps>(
  function AppTextarea({ className, disabled, invalid, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        aria-disabled={disabled || undefined}
        aria-invalid={invalid || undefined}
        className={cn(
          "app-textarea",
          disabled && "app-textarea--disabled",
          invalid && "app-textarea--invalid",
          className,
        )}
        disabled={disabled}
        {...props}
      />
    );
  },
);
