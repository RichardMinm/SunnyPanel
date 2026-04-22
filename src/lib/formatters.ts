import type { SiteLocale } from "@/lib/site-copy";

const formatterLocales: Record<SiteLocale, string> = {
  en: "en-US",
  zh: "zh-CN",
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

const getFormatter = (locale: SiteLocale, options: Intl.DateTimeFormatOptions) => {
  const cacheKey = `${locale}:${JSON.stringify(options)}`;
  const cached = formatterCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat(formatterLocales[locale], options);
  formatterCache.set(cacheKey, formatter);
  return formatter;
};

export const formatDate = (value?: null | string, locale: SiteLocale = "zh") => {
  if (!value) {
    return locale === "en" ? "Date not set" : "未设置日期";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return locale === "en" ? "Invalid date" : "无效日期";
  }

  return getFormatter(locale, { dateStyle: "long" }).format(date);
};

export const formatShortDate = (value?: null | string, locale: SiteLocale = "zh") => {
  if (!value) {
    return locale === "en" ? "Date not set" : "未设置日期";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return locale === "en" ? "Invalid date" : "无效日期";
  }

  return getFormatter(locale, { dateStyle: "medium" }).format(date);
};

export const formatDateTime = (value?: null | string, locale: SiteLocale = "zh") => {
  if (!value) {
    return locale === "en" ? "Time not set" : "未设置时间";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return locale === "en" ? "Invalid time" : "无效时间";
  }

  return getFormatter(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};
