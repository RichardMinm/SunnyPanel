"use client";

import { useOptionalSitePreferences } from "@/components/shared/SitePreferencesProvider";
import { readSiteLocaleFromDocument } from "@/lib/site-cookies";
import { getSiteCopy } from "@/lib/site-copy";

export function SunnyAdminLogo() {
  const preferences = useOptionalSitePreferences();
  const locale = preferences?.locale ?? readSiteLocaleFromDocument();
  const copy = getSiteCopy(locale);

  return (
    <div className="sunny-admin-login-logo">
      <span className="sunny-admin-header-mark" aria-hidden="true">
        S
      </span>
      <strong>SunnyPanel</strong>
      <span>{copy.frame.tagline}</span>
    </div>
  );
}
