import type { Field } from "payload";

export const writingCategoryField: Field = {
  name: "writingCategory",
  type: "relationship",
  admin: {
    position: "sidebar",
  },
  label: "文档集",
  relationTo: "writing-categories",
};
