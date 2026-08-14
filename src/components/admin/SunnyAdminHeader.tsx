"use client";

import Link from "next/link";

import { useOptionalSitePreferences } from "@/components/shared/SitePreferencesProvider";
import { getAdminWorkspaceCopy } from "@/lib/admin-nav";

export function SunnyAdminHeader() {
  const preferences = useOptionalSitePreferences();
  const copy = getAdminWorkspaceCopy(preferences?.locale ?? "zh");

  return (
    <header className="sunny-admin-header">
      <div className="sunny-admin-header-identity">
        <Link aria-label={copy.backToDashboard} className="sunny-admin-header-brand" href="/dashboard">
          <span aria-hidden className="sunny-admin-header-mark">S</span>
          <span className="sunny-admin-header-copy">
            <strong>SunnyPanel</strong>
            <span>{copy.advancedManagement}</span>
          </span>
        </Link>
        <p>{copy.advancedDescription}</p>
      </div>
      <nav aria-label={copy.workspace} className="sunny-admin-header-actions">
        <Link className="sunny-admin-header-link" href="/dashboard?mode=writing">
          {copy.writingStudio}
        </Link>
        <Link className="sunny-admin-header-link is-primary" href="/dashboard">
          {copy.backToDashboard}
        </Link>
      </nav>
    </header>
  );
}
