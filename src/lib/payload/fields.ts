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
    overrides: (field) => ({
      ...field,
      fields: field.fields.map((subField, index) => {
        if (index !== 0) {
          return subField;
        }

        const generateField = subField as Field & {
          admin?: {
            description?: string;
            hidden?: boolean;
          };
          defaultValue?: boolean;
          label?: string;
          name?: string;
        };

        if (generateField.name !== "generateSlug") {
          return subField;
        }

        return {
          ...generateField,
          admin: {
            ...generateField.admin,
            description: "需要自动生成时再勾选；默认可直接手动输入 slug。",
            hidden: false,
          },
          defaultValue: false,
          label: "Auto-generate slug",
        } as Field;
      }),
    }),
    useAsSlug,
    position: "sidebar",
  });
