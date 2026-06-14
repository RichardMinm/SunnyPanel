type RichContentFallbackSource = {
  contentExcerpt?: null | string;
  contentText?: null | string;
  legacyContentMarkdown?: null | string;
};

const getOptionalString = (source: object, key: keyof RichContentFallbackSource) => {
  if (!(key in source)) {
    return undefined;
  }

  const value = source[key as keyof typeof source];

  return typeof value === "string" ? value : undefined;
};

const firstNonEmpty = (...values: Array<null | string | undefined>) =>
  values.find((value): value is string => typeof value === "string" && value.trim().length > 0) ?? "";

export const getContentMarkdownFallback = (source: object) =>
  firstNonEmpty(
    getOptionalString(source, "legacyContentMarkdown"),
    getOptionalString(source, "contentText"),
    getOptionalString(source, "contentExcerpt"),
  );

export const getContentTextFallback = (source: object) =>
  firstNonEmpty(
    getOptionalString(source, "contentText"),
    getOptionalString(source, "contentExcerpt"),
    getOptionalString(source, "legacyContentMarkdown"),
  );
