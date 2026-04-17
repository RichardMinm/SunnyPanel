import type { CollectionConfig } from "payload";

import { adminsOrFirstUser, adminsOnly, canAccessAdmin } from "../lib/payload/access.ts";

export const Users: CollectionConfig = {
  slug: "users",
  access: {
    admin: canAccessAdmin,
    create: adminsOrFirstUser,
    delete: adminsOnly,
    read: adminsOnly,
    update: adminsOnly,
  },
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
