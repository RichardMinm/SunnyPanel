import Link from "next/link";
import type { ReactNode } from "react";

const cx = (...classes: Array<false | null | string | undefined>) => classes.filter(Boolean).join(" ");

type SurfaceCardVariant = "default" | "interactive" | "strong" | "subtle";
type SurfaceCardElement = "article" | "aside" | "div" | "section";

const surfaceCardClassMap: Record<SurfaceCardVariant, string> = {
  default: "sunny-card rounded-[1.35rem] p-5 md:rounded-[1.6rem] md:p-6",
  interactive:
    "block rounded-[1.15rem] border border-border bg-white/60 px-4 py-4 transition hover:-translate-y-1 hover:bg-white/72 md:px-5 md:py-5",
  strong: "sunny-card sunny-card-strong rounded-[1.45rem] p-5 md:rounded-[1.8rem] md:p-7",
  subtle: "rounded-[1.15rem] border border-border bg-white/45 px-4 py-4 md:px-5 md:py-5",
};

export function SurfaceCard({
  as: Component = "div",
  children,
  className,
  variant = "default",
}: {
  as?: SurfaceCardElement;
  children: ReactNode;
  className?: string;
  variant?: SurfaceCardVariant;
}) {
  return <Component className={cx(surfaceCardClassMap[variant], className)}>{children}</Component>;
}

export function SectionHeader({
  action,
  className,
  description,
  kicker,
  size = "md",
  title,
}: {
  action?: ReactNode;
  className?: string;
  description?: string;
  kicker: string;
  size?: "lg" | "md" | "sm";
  title: string;
}) {
  const titleClassName =
    size === "lg"
      ? "sunny-display mt-2 text-[2rem] text-foreground md:text-3xl"
      : size === "sm"
        ? "mt-1 text-base font-semibold text-foreground"
        : "mt-1 text-xl font-semibold text-foreground";

  return (
    <div className={cx("flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="min-w-0">
        <p className="sunny-kicker text-[0.68rem] text-muted">{kicker}</p>
        <h2 className={titleClassName}>{title}</h2>
        {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export type StatusBadgeTone = "accent" | "danger" | "info" | "neutral" | "success" | "warning";

const statusBadgeToneClassMap: Record<StatusBadgeTone, string> = {
  accent: "bg-[var(--accent-soft)] text-accent-strong",
  danger: "bg-rose-100 text-rose-700",
  info: "bg-sky-100 text-sky-700",
  neutral: "bg-stone-200 text-stone-700",
  success: "bg-emerald-100 text-emerald-700",
  warning: "bg-amber-100 text-amber-800",
};

export function StatusBadge({
  children,
  className,
  size = "sm",
  tone = "neutral",
}: {
  children: ReactNode;
  className?: string;
  size?: "md" | "sm";
  tone?: StatusBadgeTone;
}) {
  return (
    <span
      className={cx(
        size === "md" ? "sunny-badge" : "sunny-dashboard-badge",
        statusBadgeToneClassMap[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  action,
  children,
  className,
  description,
  title,
}: {
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  description?: string;
  title?: string;
}) {
  return (
    <div className={cx("sunny-dashboard-empty", className)}>
      {title ? <h3 className="text-sm font-semibold text-foreground">{title}</h3> : null}
      {description ? <p className={title ? "mt-1" : ""}>{description}</p> : null}
      {children}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function QuickActionCard({
  badge,
  description,
  href,
  title,
}: {
  badge?: ReactNode;
  description: string;
  href: string;
  title: string;
}) {
  return (
    <Link href={href} className="sunny-quick-create-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="sunny-kicker text-[0.62rem] text-muted">{description}</span>
          <span className="mt-1 block text-sm font-semibold text-foreground">{title}</span>
        </div>
        {badge ? <div className="shrink-0">{badge}</div> : null}
      </div>
    </Link>
  );
}

export function TimelineMiniCard({
  className,
  date,
  description,
  href,
  title,
  type,
  variant = "card",
}: {
  className?: string;
  date: ReactNode;
  description?: string;
  href: string;
  title: string;
  type: string;
  variant?: "card" | "rail";
}) {
  if (variant === "rail") {
    return (
      <Link
        href={href}
        className={cx(
          "block border-b border-border py-3 transition hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)]",
          className,
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <StatusBadge tone="accent">{type}</StatusBadge>
          <span className="text-xs text-muted">{date}</span>
        </div>
        <p className="mt-2 text-sm font-semibold leading-6 text-foreground">{title}</p>
        {description ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{description}</p> : null}
      </Link>
    );
  }

  return (
    <Link href={href} className={cx(surfaceCardClassMap.interactive, className)}>
      <div className="flex items-center justify-between gap-3">
        <StatusBadge size="md" tone="accent">
          {type}
        </StatusBadge>
        <span className="text-xs text-muted">{date}</span>
      </div>
      <p className="mt-3 text-sm font-semibold leading-7 text-foreground">{title}</p>
      {description ? <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted">{description}</p> : null}
    </Link>
  );
}

export function StatCard({
  description,
  label,
  value,
}: {
  description: string;
  label: string;
  value: number | string;
}) {
  return (
    <div className="sunny-dashboard-stat">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-muted">{label}</p>
        <p className="sunny-dashboard-clamp mt-1 text-xs leading-5 text-muted">{description}</p>
      </div>
      <p className="text-2xl font-semibold leading-none text-foreground">{value}</p>
    </div>
  );
}
