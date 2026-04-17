import path from "node:path";

import type { CollectionConfig } from "payload";

import { adminsOnly, canAccessAdmin } from "../lib/payload/access.ts";

export const Media: CollectionConfig = {
  slug: "media",
  access: {
    admin: canAccessAdmin,
    create: adminsOnly,
    delete: adminsOnly,
    read: () => true,
    update: adminsOnly,
  },
  admin: {
    defaultColumns: ["filename", "alt", "updatedAt"],
  },
  fields: [
    {
      name: "alt",
      type: "text",
      required: true,
    },
  ],
  upload: {
    staticDir: path.resolve(process.cwd(), "media"),
    focalPoint: true,
    imageSizes: [
      {
        name: "card",
        width: 960,
        height: 640,
      },
      {
        name: "thumbnail",
        width: 480,
        height: 320,
      },
    ],
    mimeTypes: ["image/*"],
  },
};
