import type { Field, FieldHook } from "payload";

const normalizeSlug = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const createSlugAutofillHook = (useAsSlug: string): FieldHook => ({ data, originalDoc, value }) => {
  if (typeof value === "string" && value.trim()) {
    return normalizeSlug(value);
  }

  if (
    originalDoc &&
    typeof originalDoc === "object" &&
    "slug" in originalDoc &&
    typeof originalDoc.slug === "string" &&
    originalDoc.slug.trim()
  ) {
    return originalDoc.slug;
  }

  const sourceValue = data?.[useAsSlug];

  if (typeof sourceValue !== "string" || !sourceValue.trim()) {
    return value;
  }

  const generated = normalizeSlug(sourceValue);

  return generated || value;
};

export const statusField: Field = {
  name: "status",
  type: "select",
  defaultValue: "draft",
  index: true,
  options: [
    {
      label: "Draft",
      value: "draft",
    },
    {
      label: "Published",
      value: "published",
    },
  ],
  required: true,
};

export const visibilityField = (defaultValue: "private" | "public" = "public"): Field => ({
  name: "visibility",
  type: "select",
  defaultValue,
  index: true,
  options: [
    {
      label: "Public",
      value: "public",
    },
    {
      label: "Private",
      value: "private",
    },
  ],
  required: true,
});

export const publishedAtField: Field = {
  name: "publishedAt",
  type: "date",
  admin: {
    description: "Optional publish date for sorting and display.",
    position: "sidebar",
  },
};

export const createSlugField = (useAsSlug = "title"): Field => ({
  name: "slug",
  type: "text",
  index: true,
  localized: false,
  required: true,
  unique: true,
  admin: {
    description: "可直接手动输入。若留空，系统会尝试根据标题自动生成。",
    placeholder: "例如：math-functions",
    position: "sidebar",
  },
  hooks: {
    beforeValidate: [createSlugAutofillHook(useAsSlug)],
  },
});
