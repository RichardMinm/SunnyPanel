import type { CollectionConfig } from "payload";

export const Users: CollectionConfig = {
  slug: "users",
  admin: {
    useAsTitle: "email",
  },
  auth: true,
  fields: [
    {
      name: "displayName",
      type: "text",
      admin: {
        description: "Optional display name for the single admin account.",
      },
    },
  ],
};
