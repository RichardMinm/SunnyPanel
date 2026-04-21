import type { CollectionAfterChangeHook, CollectionConfig } from "payload";

import type { User } from "@/payload-types";

import { ensureInitialWorkspace } from "../lib/payload/onboarding.ts";
import { adminsOrFirstUser, adminsOnly, canAccessAdmin } from "../lib/payload/access.ts";

const seedInitialWorkspace: CollectionAfterChangeHook<User> = async ({ doc, operation, req }) => {
  if (operation !== "create") {
    return doc;
  }

  const totalUsers = await req.payload.count({
    collection: "users",
    overrideAccess: true,
  });

  if (totalUsers.totalDocs !== 1) {
    return doc;
  }

  await ensureInitialWorkspace(req.payload, doc);

  return doc;
};

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
  hooks: {
    afterChange: [seedInitialWorkspace],
  },
  fields: [
    {
      name: "displayName",
      type: "text",
      admin: {
        description: "Optional display name for the single admin account.",
      },
    },
  ],
  labels: {
    plural: {
      en: "Users",
      zh: "用户",
    },
    singular: {
      en: "User",
      zh: "用户",
    },
  },
};
