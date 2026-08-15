import assert from "node:assert/strict";
import { spawn } from "node:child_process";

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import { migrations } from "../src/migrations/index.ts";
import * as mediaVisibilityMigration from "../src/migrations/20260810_add_media_visibility.ts";
import * as deepseekProviderMigration from "../src/migrations/20260815_add_deepseek_agent_provider.ts";

const targetConnectionString = process.env.UPGRADE_TEST_DATABASE_URL?.trim();
const sourceConnectionString = process.env.DATABASE_URL?.trim();
const previousReleaseUpgradeNames = [
  "20260810_add_media_visibility",
  "20260815_add_deepseek_agent_provider",
];
const allowedHosts = new Set(["127.0.0.1", "localhost"]);

if (!targetConnectionString) {
  throw new Error("UPGRADE_TEST_DATABASE_URL is required.");
}

if (!sourceConnectionString) {
  throw new Error("DATABASE_URL is required.");
}

const targetUrl = new URL(targetConnectionString);
const sourceUrl = new URL(sourceConnectionString);
const targetDatabaseName = decodeURIComponent(targetUrl.pathname.slice(1));
const sourceDatabaseName = decodeURIComponent(sourceUrl.pathname.slice(1));

if (!allowedHosts.has(targetUrl.hostname)) {
  throw new Error("Upgrade verification may only use a local PostgreSQL server.");
}

if (!/^sunnypanel_[a-z0-9_]*upgrade[a-z0-9_]*$/u.test(targetDatabaseName)) {
  throw new Error(
    "Upgrade verification database name must be an isolated sunnypanel_*upgrade* database.",
  );
}

if (
  targetUrl.hostname === sourceUrl.hostname
  && targetUrl.port === sourceUrl.port
  && targetDatabaseName === sourceDatabaseName
) {
  throw new Error("Upgrade verification database must differ from DATABASE_URL.");
}

if (
  process.env.CI !== "true"
  && process.env.ALLOW_UPGRADE_TEST_DATABASE_DROP !== "1"
) {
  throw new Error(
    "Set ALLOW_UPGRADE_TEST_DATABASE_DROP=1 to run destructive isolated upgrade verification locally.",
  );
}

const adminUrl = new URL(targetUrl);
adminUrl.pathname = "/postgres";
const escapedTargetDatabase = pg.escapeIdentifier(targetDatabaseName);

const runNpmScript = (script) => new Promise((resolve, reject) => {
  const child = spawn("npm", ["run", script], {
    env: {
      ...process.env,
      DATABASE_URL: targetConnectionString,
      NODE_ENV: "production",
      PAYLOAD_DB_PUSH: "false",
    },
    stdio: "inherit",
  });

  child.once("error", reject);
  child.once("exit", (code, signal) => {
    if (code === 0) {
      resolve();
      return;
    }

    reject(new Error(
      `npm run ${script} failed with ${signal ? `signal ${signal}` : `exit code ${String(code)}`}.`,
    ));
  });
});

const recreateTargetDatabase = async () => {
  const client = new pg.Client({ connectionString: adminUrl.toString() });

  try {
    await client.connect();
    await client.query(`DROP DATABASE IF EXISTS ${escapedTargetDatabase} WITH (FORCE)`);
    await client.query(`CREATE DATABASE ${escapedTargetDatabase}`);
  } finally {
    await client.end();
  }
};

const dropTargetDatabase = async () => {
  const client = new pg.Client({ connectionString: adminUrl.toString() });

  try {
    await client.connect();
    await client.query(`DROP DATABASE IF EXISTS ${escapedTargetDatabase} WITH (FORCE)`);
  } finally {
    await client.end();
  }
};

const createPreviousReleaseFixture = async () => {
  const pool = new pg.Pool({ connectionString: targetConnectionString });
  const db = drizzle({ client: pool });

  try {
    await deepseekProviderMigration.down({
      db,
      payload: undefined,
      req: undefined,
    });
    await mediaVisibilityMigration.down({
      db,
      payload: undefined,
      req: undefined,
    });
  } finally {
    await pool.end();
  }

  const client = new pg.Client({ connectionString: targetConnectionString });

  try {
    await client.connect();
    await client.query(
      "DELETE FROM payload_migrations WHERE name = ANY($1::text[])",
      [previousReleaseUpgradeNames],
    );

    const mediaResult = await client.query(
      `INSERT INTO media (alt, filename, mime_type, filesize)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      ["Upgrade fixture image", "upgrade-fixture.png", "image/png", 128],
    );
    const mediaId = Number(mediaResult.rows[0]?.id);
    assert.ok(Number.isInteger(mediaId) && mediaId > 0);

    const postResult = await client.query(
      `INSERT INTO posts (title, slug, summary, content_rich, cover_image_id)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       RETURNING id`,
      [
        "Upgrade fixture post",
        "upgrade-fixture-post",
        "Existing content must survive migration.",
        JSON.stringify({
          content: [{
            content: [{ text: "Existing content", type: "text" }],
            type: "paragraph",
          }],
          type: "doc",
        }),
        mediaId,
      ],
    );
    const postId = Number(postResult.rows[0]?.id);
    assert.ok(Number.isInteger(postId) && postId > 0);

    return { mediaId, postId };
  } finally {
    await client.end();
  }
};

const verifyUpgradedDatabase = async ({ mediaId, postId }) => {
  const client = new pg.Client({ connectionString: targetConnectionString });

  try {
    await client.connect();

    const existingMedia = await client.query(
      "SELECT visibility FROM media WHERE id = $1",
      [mediaId],
    );
    assert.equal(existingMedia.rows[0]?.visibility, "public");

    const newMedia = await client.query(
      "INSERT INTO media (alt) VALUES ($1) RETURNING visibility",
      ["Post-upgrade private image"],
    );
    assert.equal(newMedia.rows[0]?.visibility, "private");

    const existingPost = await client.query(
      "SELECT cover_image_id FROM posts WHERE id = $1",
      [postId],
    );
    assert.equal(Number(existingPost.rows[0]?.cover_image_id), mediaId);

    const mediaColumn = await client.query(
      `SELECT column_default, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'media'
         AND column_name = 'visibility'`,
    );
    assert.equal(mediaColumn.rows[0]?.is_nullable, "NO");
    assert.match(String(mediaColumn.rows[0]?.column_default), /private/u);

    const indexResult = await client.query(
      "SELECT to_regclass('public.media_visibility_idx') AS index_name",
    );
    assert.equal(indexResult.rows[0]?.index_name, "media_visibility_idx");

    const providerEnum = await client.query(
      `SELECT enumlabel
       FROM pg_enum
       JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
       JOIN pg_namespace ON pg_namespace.oid = pg_type.typnamespace
       WHERE pg_namespace.nspname = 'public'
         AND pg_type.typname = 'enum_agent_settings_provider'
       ORDER BY enumsortorder`,
    );
    assert.deepEqual(
      providerEnum.rows.map((row) => row.enumlabel),
      ["deepseek", "openai-compatible", "openai", "zai"],
    );

    const providerColumn = await client.query(
      `SELECT column_default
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'agent_settings'
         AND column_name = 'provider'`,
    );
    assert.match(String(providerColumn.rows[0]?.column_default), /deepseek/u);

    const migrationRows = await client.query(
      "SELECT name, batch FROM payload_migrations ORDER BY id",
    );
    const appliedNames = new Set(migrationRows.rows.map((row) => row.name));
    const missingNames = migrations
      .map((migration) => migration.name)
      .filter((name) => !appliedNames.has(name));
    assert.deepEqual(missingNames, []);
    for (const name of previousReleaseUpgradeNames) {
      assert.equal(
        migrationRows.rows.filter((row) => row.name === name).length,
        1,
      );
    }
    assert.equal(
      migrationRows.rows.filter((row) => Number(row.batch) === -1).length,
      0,
    );

    const checkpointRows = await client.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])`,
      [[
        "checkpoint_blobs",
        "checkpoint_migrations",
        "checkpoint_writes",
        "checkpoints",
      ]],
    );
    assert.equal(checkpointRows.rowCount, 4);

    const versionTables = await client.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])`,
      [["_notes_v", "_pages_v", "_posts_v", "_updates_v"]],
    );
    assert.equal(versionTables.rowCount, 4);
  } finally {
    await client.end();
  }
};

let databaseCreated = false;

try {
  await recreateTargetDatabase();
  databaseCreated = true;

  await runNpmScript("migrate");
  const fixture = await createPreviousReleaseFixture();
  await runNpmScript("migrate");
  await runNpmScript("agent:checkpoint:setup");
  await runNpmScript("verify:migrations");
  await verifyUpgradedDatabase(fixture);

  console.info(
    "[upgrade-migrations] Previous-release data, relationships, migrations, and checkpoints are ready.",
  );
} finally {
  if (databaseCreated) {
    await dropTargetDatabase();
  }
}
