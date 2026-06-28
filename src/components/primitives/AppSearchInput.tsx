"use client";

import { forwardRef, useCallback, useRef, type InputHTMLAttributes } from "react";

import { AppIconButton } from "@/components/primitives/AppIconButton";
import { AppInput } from "@/components/primitives/AppInput";

export type AppSearchInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "leftIcon" | "rightSlot" | "type"
> & {
  onClear?: () => void;
};

export const AppSearchInput = forwardRef<HTMLInputElement, AppSearchInputProps>(
  function AppSearchInput({ className, onChange, onClear, value, ...props }, ref) {
    const innerRef = useRef<HTMLInputElement>(null);
    const resolvedRef = (ref ?? innerRef) as React.RefObject<HTMLInputElement>;

    const hasValue = typeof value === "string" ? value.length > 0 : false;

    const handleClear = useCallback(() => {
      if (onClear) {
        onClear();
      } else {
        /* Dispatch a synthetic change to clear the field via native DOM. */
        const input = resolvedRef.current;
        if (input) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            "value",
          )?.set;
          nativeInputValueSetter?.call(input, "");
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
          input.focus();
        }
      }
    }, [onClear, resolvedRef]);

    return (
      <AppInput
        ref={resolvedRef}
        className={cn("app-search-input", className)}
        leftIcon={<SearchIcon />}
        onChange={onChange}
        rightSlot={
          hasValue ? (
            <AppIconButton
              aria-label="清除搜索"
              icon={<ClearIcon />}
              onClick={handleClear}
              size="sm"
              tabIndex={-1}
            />
          ) : undefined
        }
        type="search"
        value={value}
        {...props}
      />
    );
  },
);

/* inline helpers until we have an icon system */
function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      className="app-search-input__search-icon"
      fill="none"
      height="16"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
      width="16"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg
      aria-hidden="true"
      className="app-search-input__clear-icon"
      fill="none"
      height="14"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
      width="14"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
