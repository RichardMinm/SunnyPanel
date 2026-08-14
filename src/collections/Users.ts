import { APIError } from "payload";
import type {
  CollectionAfterChangeHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
} from "payload";

import type { User } from "@/payload-types";

import { ensureInitialWorkspace } from "../lib/payload/onboarding.ts";
import { adminsOnly, canAccessAdmin } from "../lib/payload/access.ts";
import { withAdminNavGroup } from "../lib/payload/admin-groups.ts";

export const requireTrustedInitialAdminBootstrap: CollectionBeforeValidateHook<User> = async ({
  data,
  operation,
  req,
}) => {
  if (operation !== "create" || req.user) {
    return data;
  }

  const context = req.context as Record<string, unknown>;
  if (context.allowInitialAdminBootstrap !== true) {
    throw new APIError(
      "Initial admin creation is restricted to the trusted bootstrap context used by the offline seed command.",
      403,
    );
  }

  const totalUsers = await req.payload.count({
    collection: "users",
    overrideAccess: true,
  });

  if (totalUsers.totalDocs !== 0) {
    throw new APIError("An initial admin already exists.", 403);
  }

  return data;
};

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
    create: adminsOnly,
    delete: adminsOnly,
    read: adminsOnly,
    update: adminsOnly,
  },
  admin: {
    ...withAdminNavGroup("system"),
    useAsTitle: "email",
  },
  auth: true,
  hooks: {
    afterChange: [seedInitialWorkspace],
    beforeValidate: [requireTrustedInitialAdminBootstrap],
  },
  fields: [
    {
      name: "displayName",
      type: "text",
      label: "显示名称",
      admin: {
        description: "可选。用于后台和工作台里显示你的称呼。",
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
