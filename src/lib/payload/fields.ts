import type { Field } from "payload";
import { slugField } from "payload";

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

export const createSlugField = (useAsSlug = "title"): Field =>
  slugField({
    useAsSlug,
    position: "sidebar",
  });
