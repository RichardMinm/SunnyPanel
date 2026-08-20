import "dotenv/config";

import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import pg from "pg";

import {
  parseSunnyAgentCheckpointThreadId,
  resolveCheckpointRetentionDays,
  selectCheckpointCleanupCandidates,
} from "../src/lib/agent/langgraph/checkpoint-lifecycle";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const readArgument = (prefix: string) =>
  [...args].find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
const retentionDays = resolveCheckpointRetentionDays(
  readArgument("--retention-days=")
    ?? process.env.AGENT_CHECKPOINT_RETENTION_DAYS,
);
const limitValue = readArgument("--limit=") ?? "1000";
const limit = Number(limitValue);

if (!Number.isInteger(limit) || limit < 1 || limit > 10_000) {
  throw new Error("Checkpoint cleanup limit must be an integer from 1 to 10000.");
}

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required before checkpoint cleanup.");
}

const pool = new pg.Pool({ connectionString });

try {
  const [checkpointResult, threadResult] = await Promise.all([
    pool.query<{
      last_seen_at: Date | null;
      thread_id: string;
    }>(`
      WITH checkpoint_thread_ids AS (
        SELECT thread_id FROM checkpoints
        UNION SELECT thread_id FROM checkpoint_blobs
        UNION SELECT thread_id FROM checkpoint_writes
      )
      SELECT
        ids.thread_id,
        MAX(NULLIF(checkpoints.checkpoint->>'ts', '')::timestamptz) AS last_seen_at
      FROM checkpoint_thread_ids AS ids
      LEFT JOIN checkpoints ON checkpoints.thread_id = ids.thread_id
      WHERE ids.thread_id LIKE 'sunny-agent:%'
      GROUP BY ids.thread_id
      ORDER BY last_seen_at ASC NULLS FIRST, ids.thread_id ASC
    `),
    pool.query<{
      archived: boolean | null;
      id: number;
      status: "active" | "closed";
      user_id: number;
    }>(`
      SELECT archived, id, status, user_id
      FROM agent_threads
    `),
  ]);

  const activeThreadKeys = new Set(
    threadResult.rows.map((row) => `${row.user_id}:${row.id}`),
  );
  const retentionEligibleThreadKeys = new Set(
    threadResult.rows
      .filter((row) => row.archived === true || row.status === "closed")
      .map((row) => `${row.user_id}:${row.id}`),
  );
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1_000);
  const candidates = selectCheckpointCleanupCandidates({
    activeThreadKeys,
    cutoff,
    records: checkpointResult.rows.map((row) => ({
      lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at) : null,
      threadId: row.thread_id,
    })),
    retentionEligibleThreadKeys,
  }).slice(0, limit);
  const counts = candidates.reduce<Record<string, number>>((result, candidate) => {
    result[candidate.reason] = (result[candidate.reason] ?? 0) + 1;
    return result;
  }, {});

  if (apply) {
    const saver = new PostgresSaver(pool);
    for (const candidate of candidates) {
      const identity = parseSunnyAgentCheckpointThreadId(candidate.threadId);
      if (!identity) continue;

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const current = await client.query<{
          archived: boolean | null;
          status: "active" | "closed";
        }>(`
          SELECT archived, status
          FROM agent_threads
          WHERE id = $1 AND user_id = $2
          FOR UPDATE
        `, [identity.threadId, identity.userId]);
        const row = current.rows[0];
        const stillEligible =
          !row || row.archived === true || row.status === "closed";

        if (stillEligible) {
          await saver.deleteThread(candidate.threadId);
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    }
  }

  console.info(JSON.stringify({
    action: apply ? "deleted" : "dry_run",
    candidates: candidates.length,
    counts,
    retentionDays,
    scanned: checkpointResult.rowCount,
  }));
} finally {
  await pool.end();
}
