"use client";

import Link from "next/link";

import { SiteBrand } from "@/components/shared/SiteBrand";
import { ThemeToggle } from "@/components/public/ThemeToggle";
import { useSitePreferences } from "@/components/shared/SitePreferencesProvider";

export function DashboardWorkspaceChrome() {
  const { locale } = useSitePreferences();

  return (
    <header className="sunny-chrome-header sunny-dashboard-chrome">
      <div className="sunny-chrome-header-inner">
        <SiteBrand locale={locale} variant="admin" />

        <div className="sunny-chrome-header-actions">
          <Link href="/" className="sunny-chrome-nav-link" target="_blank" rel="noopener noreferrer">
            前台
          </Link>
          <Link href="/admin" className="sunny-chrome-nav-link">
            后台
          </Link>
          <ThemeToggle locale={locale} variant="admin" />
        </div>
      </div>
    </header>
  );
}
