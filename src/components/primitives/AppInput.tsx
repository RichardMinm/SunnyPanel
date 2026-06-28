"use client";

import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/ui/cn";

export type AppInputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
  leftIcon?: ReactNode;
  rightSlot?: ReactNode;
};

export const AppInput = forwardRef<HTMLInputElement, AppInputProps>(function AppInput(
  {
    "aria-label": ariaLabel,
    className,
    disabled,
    invalid,
    leftIcon,
    rightSlot,
    ...props
  },
  ref,
) {
  return (
    <span
      className={cn(
        "app-input",
        disabled && "app-input--disabled",
        invalid && "app-input--invalid",
        leftIcon ? "app-input--with-left-icon" : undefined,
        rightSlot ? "app-input--with-right-slot" : undefined,
        className,
      )}
    >
      {leftIcon ? <span className="app-input__left-icon" aria-hidden="true">{leftIcon}</span> : null}
      <input
        ref={ref}
        aria-disabled={disabled || undefined}
        aria-invalid={invalid || undefined}
        aria-label={ariaLabel}
        className="app-input__field"
        disabled={disabled}
        {...props}
      />
      {rightSlot ? <span className="app-input__right-slot">{rightSlot}</span> : null}
    </span>
  );
});
