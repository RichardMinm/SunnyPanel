import path from "node:path";
import { fileURLToPath } from "node:url";

import { postgresAdapter } from "@payloadcms/db-postgres";
import { en } from "payload/i18n/en";
import { zh } from "payload/i18n/zh";
import sharp from "sharp";
import { buildConfig } from "payload";

import { AgentRun } from "./src/collections/AgentRun.ts";
import { AgentActionReceipt } from "./src/collections/AgentActionReceipt.ts";
import { AgentThreadEvent } from "./src/collections/AgentThreadEvent.ts";
import { AgentMemory } from "./src/collections/AgentMemory.ts";
import { AgentSuggestion } from "./src/collections/AgentSuggestion.ts";
import { AgentThread } from "./src/collections/AgentThread.ts";
import { Media } from "./src/collections/Media.ts";
import { Note } from "./src/collections/Note.ts";
import { Page } from "./src/collections/Page.ts";
import { Plan } from "./src/collections/Plan.ts";
import { PlanReview } from "./src/collections/PlanReview.ts";
import { Post } from "./src/collections/Post.ts";
import { ScheduleItem } from "./src/collections/ScheduleItem.ts";
import { Checklist } from "./src/collections/Checklist.ts";
import { TimelineEvent } from "./src/collections/TimelineEvent.ts";
import { Update } from "./src/collections/Update.ts";
import { Users } from "./src/collections/Users.ts";
import { AgentSettings } from "./src/globals/AgentSettings.ts";
import { buildLivePreviewPath, isPreviewCollectionSlug, livePreviewBreakpoints } from "./src/lib/payload/preview.ts";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

const serverURL = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3000";

// Validate PAYLOAD_SECRET at startup — must be a strong random string in production
const payloadSecret = process.env.PAYLOAD_SECRET;
if (!payloadSecret || payloadSecret === "change-this-before-production") {
  throw new Error(
    "PAYLOAD_SECRET environment variable must be set to a strong random string.\n" +
    'Generate one with: openssl rand -base64 32'
  );
}
// Minimum 16 bytes of entropy (base64 encoded → ~24 chars)
if (Buffer.byteLength(payloadSecret, "utf8") < 24) {
  throw new Error(
    "PAYLOAD_SECRET is too short — must be at least 24 characters.\n" +
    'Generate a strong one with: openssl rand -base64 32'
  );
}

// Build CORS/CSRF allow list from serverURL + optional CORS_EXTRA_ORIGINS
const extraOrigins = process.env.CORS_EXTRA_ORIGINS
  ? process.env.CORS_EXTRA_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
  : [];
const allowedOrigins = [serverURL, ...extraOrigins];

export default buildConfig({
  admin: {
    suppressHydrationWarning: true,
    theme: "all",
    components: {
      providers: ["@/components/admin/SunnyAdminProviders#SunnyAdminProviders"],
      Nav: "@/components/admin/SunnyAdminNav#SunnyAdminNav",
      header: ["@/components/admin/SunnyAdminHeader#SunnyAdminHeader"],
      graphics: {
        Icon: "@/components/admin/SunnyAdminIcon#SunnyAdminIcon",
        Logo: "@/components/admin/SunnyAdminLogo#SunnyAdminLogo",
      },
      views: {
        dashboard: {
          Component: "@/components/admin/SunnyAdminDashboard#SunnyAdminDashboard",
        },
      },
    },
    livePreview: {
      breakpoints: [...livePreviewBreakpoints],
      collections: ["posts", "pages", "notes", "updates", "checklists", "timeline-events"],
      url: ({ collectionConfig, data }) => {
        const collectionSlug = collectionConfig?.slug;

        if (!collectionSlug || !isPreviewCollectionSlug(collectionSlug)) {
          return null;
        }

        const id = typeof data?.id === "number" || typeof data?.id === "string" ? data.id : undefined;

        return buildLivePreviewPath({
          collection: collectionSlug,
          id,
        });
      },
    },
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname, "src"),
      importMapFile: path.resolve(dirname, "src/app/(payload)/admin/importMap.js"),
    },
  },
  collections: [Users, Media, Post, Note, Update, Checklist, TimelineEvent, Plan, ScheduleItem, PlanReview, AgentThread, AgentRun, AgentActionReceipt, AgentThreadEvent, AgentMemory, AgentSuggestion, Page],
  cors: allowedOrigins,
  csrf: allowedOrigins,
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || "",
    },
    // Production safety: never auto-push DDL unless explicitly enabled.
    // PA locals dev defaults to push=true; production MUST use migrations.
    push:
      process.env.PAYLOAD_DB_PUSH === "true"
        ? true
        : process.env.PAYLOAD_DB_PUSH === "false"
          ? false
          : process.env.NODE_ENV === "production"
            ? false
            : undefined,
  }),
  globals: [AgentSettings],
  graphQL: {
    disablePlaygroundInProduction: true,
  },
  i18n: {
    fallbackLanguage: "zh",
    supportedLanguages: {
      en,
      zh,
    },
  },
  routes: {
    admin: "/admin",
  },
  secret: payloadSecret,
  sharp,
  typescript: {
    outputFile: path.resolve(dirname, "src/payload-types.ts"),
  },
});
