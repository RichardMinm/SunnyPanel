/**
 * ── Seed Script ──
 * Creates initial admin user and default AgentSettings on first deploy.
 *
 * Usage:
 *   node scripts/seed.mjs
 *
 * Environment variables:
 *   SEED_ADMIN_EMAIL    — admin email (default: admin@sunnypanel.local)
 *   SEED_ADMIN_PASSWORD — admin password (default: auto-generated, printed to stdout)
 *   DATABASE_URL        — PostgreSQL connection string
 *   PAYLOAD_SECRET      — Payload encryption key
 */

import { getPayload } from "payload";
import config from "../payload.config.ts";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || "admin@sunnypanel.local";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || crypto.randomUUID();

async function seed() {
  console.log("[seed] Connecting to database...");
  const payload = await getPayload({ config });

  // ── Create admin user if none exists ──
  const { totalDocs } = await payload.count({
    collection: "users",
    overrideAccess: true,
  });

  if (totalDocs === 0) {
    console.log(`[seed] Creating admin user: ${ADMIN_EMAIL}`);
    await payload.create({
      collection: "users",
      data: {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        displayName: "Admin",
      },
      overrideAccess: true,
    });
    console.log(`[seed] ✓ Admin user created. Password: ${process.env.SEED_ADMIN_PASSWORD ? "(from env)" : ADMIN_PASSWORD}`);
  } else {
    console.log(`[seed] Users already exist (${totalDocs}), skipping admin creation.`);
  }

  // ── Ensure AgentSettings global exists ──
  try {
    const settings = await payload.findGlobal({
      slug: "agent-settings",
      overrideAccess: true,
    });
    // findGlobal may return a partial even when no doc exists
    if (!settings || !settings._id) {
      await payload.updateGlobal({
        slug: "agent-settings",
        data: {},
        overrideAccess: true,
      });
      console.log("[seed] ✓ AgentSettings initialized.");
    } else {
      console.log("[seed] AgentSettings already exists, skipping.");
    }
  } catch {
    // Global doesn't exist yet — create it
    await payload.updateGlobal({
      slug: "agent-settings",
      data: {},
      overrideAccess: true,
    });
    console.log("[seed] ✓ AgentSettings initialized.");
  }

  console.log("[seed] Seeding complete.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("[seed] Failed:", err);
  process.exit(1);
});
