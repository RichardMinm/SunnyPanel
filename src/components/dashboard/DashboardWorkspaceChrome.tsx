"use client";

import Link from "next/link";
import { ThemeToggle } from "@/components/public/ThemeToggle";
import { useSitePreferences } from "@/components/shared/SitePreferencesProvider";

export function DashboardWorkspaceChrome() {
  const { locale } = useSitePreferences();

  return (
    <header className="sunny-chrome-header sunny-dashboard-chrome">
      <div className="sunny-chrome-header-inner">
        <div className="flex items-center gap-4 min-w-0">
          {/* Brand with corrected tagline */}
          <Link href="/" className="flex items-center gap-3 min-w-0 text-inherit no-underline">
            <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.95rem] bg-accent text-sm font-bold text-white shadow-[0_10px_24px_var(--accent-shadow)]">
              S
            </span>
            <span className="flex flex-col min-w-0">
              <span className="text-xs font-bold tracking-[0.08em] uppercase text-accent-strong">SunnyPanel</span>
              <span className="truncate text-sm text-muted">AI 原生个人工作台</span>
            </span>
          </Link>
          {/* Placeholder: model status — backend will provide */}
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-border/60 px-2.5 py-0.5 text-xs text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            DeepSeek V3
          </span>
        </div>

        <div className="sunny-chrome-header-actions">
          {/* Placeholder: command/search entry — backend will wire */}
          <button
            type="button"
            className="hidden md:inline-flex items-center gap-2 rounded-md border border-border/60 px-3 py-1.5 text-sm text-muted hover:bg-surface transition-colors"
            aria-label="命令搜索"
          >
            <span className="text-xs font-mono">⌘K</span>
            <span className="text-xs">命令搜索...</span>
          </button>
          <Link href="/" className="sunny-chrome-nav-link" target="_blank" rel="noopener noreferrer">
            前台
          </Link>
          <Link href="/admin" className="sunny-chrome-nav-link">
            Admin
          </Link>
          <ThemeToggle locale={locale} variant="admin" />
        </div>
      </div>
    </header>
  );
}
