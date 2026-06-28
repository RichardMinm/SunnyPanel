"use client";

import Link from "next/link";
import { forwardRef, type HTMLAttributes, type MouseEvent, type ReactNode } from "react";

import { AppTooltip } from "@/components/primitives/AppTooltip";
import { cn } from "@/lib/ui/cn";

export type SidebarItemProps = Omit<HTMLAttributes<HTMLElement>, "onClick"> & {
  active?: boolean;
  badge?: number | string;
  badgeTone?: "default" | "accent";
  disabled?: boolean;
  href?: string;
  icon?: ReactNode;
  label?: ReactNode;
  nested?: boolean;
  onClick?: (event: MouseEvent) => void;
  target?: string;
  tooltip?: string;
};

export const SidebarItem = forwardRef<HTMLAnchorElement | HTMLButtonElement, SidebarItemProps>(
  function SidebarItem(
    {
      active = false,
      badge,
      badgeTone = "default",
      className,
      disabled = false,
      href,
      icon,
      label,
      nested = false,
      onClick,
      target,
      tooltip,
      ...props
    },
    ref,
  ) {
    const sharedClassName = cn(
      "app-sidebar-item",
      active && "app-sidebar-item--active",
      disabled && "app-sidebar-item--disabled",
      className,
    );

    const nestedProps = nested ? { "data-nested": "" } : {};

    const content = (
      <>
        {icon ? <span className="app-sidebar-item__icon" aria-hidden="true">{icon}</span> : null}
        <span className="app-sidebar-item__label">{label}</span>
        {badge !== undefined && badge !== null ? (
          <span
            className={cn(
              "app-sidebar-item__badge",
              badgeTone === "accent" && "app-sidebar-item__badge--accent",
            )}
          >
            {badge}
          </span>
        ) : null}
      </>
    );

    const element = href ? (
      <Link
        ref={ref as React.Ref<HTMLAnchorElement>}
        aria-current={active ? "page" : undefined}
        aria-disabled={disabled || undefined}
        className={sharedClassName}
        href={href}
        onClick={disabled ? (e) => e.preventDefault() : onClick}
        tabIndex={disabled ? -1 : undefined}
        target={target}
        {...nestedProps}
        {...(props as HTMLAttributes<HTMLAnchorElement>)}
      >
        {content}
      </Link>
    ) : (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        aria-current={active ? "true" : undefined}
        aria-disabled={disabled || undefined}
        className={sharedClassName}
        disabled={disabled}
        onClick={onClick}
        type="button"
        {...nestedProps}
        {...(props as HTMLAttributes<HTMLButtonElement>)}
      >
        {content}
      </button>
    );

    if (tooltip) {
      return (
        <AppTooltip content={tooltip} side="right">
          {element}
        </AppTooltip>
      );
    }

    return element;
  },
);
