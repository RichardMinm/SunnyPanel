import assert from "node:assert/strict";
import { spawn } from "node:child_process";

import pg from "pg";
import { getPayload } from "payload";

import { migrations } from "../src/migrations/index.ts";
import * as mediaVisibilityMigration from "../src/migrations/20260810_add_media_visibility.ts";

const targetConnectionString = process.env.UPGRADE_TEST_DATABASE_URL?.trim();
const sourceConnectionString = process.env.DATABASE_URL?.trim();
const latestMigrationName = "20260810_add_media_visibility";
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
  process.env.DATABASE_URL = targetConnectionString;
  process.env.NODE_ENV = "production";
  process.env.PAYLOAD_DB_PUSH = "false";

  const { default: config } = await import("../payload.config.ts");
  const payload = await getPayload({ config });

  try {
    assert.ok(payload.db.drizzle, "Payload PostgreSQL adapter must expose Drizzle.");
    await mediaVisibilityMigration.down({
      db: payload.db.drizzle,
      payload,
      req: undefined,
    });
  } finally {
    // Payload resets its adapter state on destroy, but the PostgreSQL adapter
    // keeps the underlying pool open. Close it before the isolated database is
    // dropped so FORCE does not terminate an idle client and emit a late error.
    await payload.db.pool?.end();
    await payload.destroy();
  }

  const client = new pg.Client({ connectionString: targetConnectionString });

  try {
    await client.connect();
    await client.query(
      "DELETE FROM payload_migrations WHERE name = $1",
      [latestMigrationName],
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

    const migrationRows = await client.query(
      "SELECT name, batch FROM payload_migrations ORDER BY id",
    );
    const appliedNames = new Set(migrationRows.rows.map((row) => row.name));
    const missingNames = migrations
      .map((migration) => migration.name)
      .filter((name) => !appliedNames.has(name));
    assert.deepEqual(missingNames, []);
    assert.equal(
      migrationRows.rows.filter((row) => row.name === latestMigrationName).length,
      1,
    );
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
