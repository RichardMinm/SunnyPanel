import path from "node:path";
import { fileURLToPath } from "node:url";

import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import sharp from "sharp";
import { buildConfig } from "payload";

import { Media } from "./src/collections/Media.js";
import { Users } from "./src/collections/Users.js";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

const serverURL = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3000";

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname, "src"),
      importMapFile: path.resolve(dirname, "src/app/(payload)/admin/importMap.js"),
    },
  },
  collections: [Users, Media],
  cors: [serverURL],
  csrf: [serverURL],
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || "",
    },
  }),
  editor: lexicalEditor(),
  graphQL: {
    disablePlaygroundInProduction: true,
  },
  routes: {
    admin: "/admin",
  },
  secret: process.env.PAYLOAD_SECRET || "change-this-before-production",
  sharp,
  typescript: {
    outputFile: path.resolve(dirname, "src/payload-types.ts"),
  },
});
