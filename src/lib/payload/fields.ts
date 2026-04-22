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
  label: "状态",
  defaultValue: "draft",
  index: true,
  options: [
    {
      label: "草稿",
      value: "draft",
    },
    {
      label: "已发布",
      value: "published",
    },
  ],
  required: true,
};

export const visibilityField = (defaultValue: "private" | "public" = "public"): Field => ({
  name: "visibility",
  type: "select",
  label: "可见范围",
  defaultValue,
  index: true,
  options: [
    {
      label: "公开",
      value: "public",
    },
    {
      label: "仅自己可见",
      value: "private",
    },
  ],
  required: true,
});

export const publishedAtField: Field = {
  name: "publishedAt",
  type: "date",
  label: "发布时间",
  admin: {
    description: "可选。用于前台排序和显示时间。",
    position: "sidebar",
  },
};

export const createSlugField = (useAsSlug = "title"): Field => ({
  type: "row",
  admin: {
    position: "sidebar",
  },
  fields: [
    {
      name: "generateSlug",
      type: "checkbox",
      label: "自动生成路径",
      admin: {
        description: "保留旧 schema 兼容；slug 现在默认可直接手动输入。",
        hidden: true,
      },
      defaultValue: false,
    },
    {
      name: "slug",
      type: "text",
      label: "路径标识",
      index: true,
      localized: false,
      required: true,
      unique: true,
      admin: {
        description: "可直接手动输入。若留空，系统会尝试根据标题自动生成。",
        placeholder: "例如：math-functions",
        width: "100%",
      },
      hooks: {
        beforeValidate: [createSlugAutofillHook(useAsSlug)],
      },
    },
  ],
});
