import { sql, type SQL } from "drizzle-orm";

import type { ScheduleStatus } from "./schedule-status-handler";

type DrizzleExecutor = {
  execute: (query: SQL) => Promise<unknown>;
};

export type ScheduleStatusPostgresAdapter = {
  drizzle?: DrizzleExecutor;
  primaryDrizzle?: DrizzleExecutor;
  schemaName?: string;
  tableNameMap: Map<string, string>;
};

type AtomicUpdateInput = {
  itemId: number;
  schemaName?: string;
  status: ScheduleStatus;
  tableName: string;
  updatedAt: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const scheduleTable = (input: Pick<AtomicUpdateInput, "schemaName" | "tableName">) =>
  input.schemaName
    ? sql`${sql.identifier(input.schemaName)}.${sql.identifier(input.tableName)}`
    : sql`${sql.identifier(input.tableName)}`;

/** Builds the sole write statement used for non-completion Schedule statuses. */
export const buildAtomicScheduleStatusUpdate = (input: AtomicUpdateInput) => sql`
  UPDATE ${scheduleTable(input)}
  SET ${sql.identifier("status")} = ${input.status}, ${sql.identifier("updated_at")} = ${input.updatedAt}
  WHERE ${sql.identifier("id")} = ${input.itemId}
    AND ${sql.identifier("status")} <> ${"done"}
  RETURNING ${sql.identifier("id")}, ${sql.identifier("status")}
`;

export const executeAtomicScheduleStatusUpdate = async (input: {
  adapter: ScheduleStatusPostgresAdapter;
  itemId: number;
  status: ScheduleStatus;
  updatedAt: string;
}): Promise<null | { id: number; status: ScheduleStatus }> => {
  const tableName = input.adapter.tableNameMap.get("schedule_items");
  if (!tableName) throw new Error("Schedule table mapping is unavailable.");
  const db = input.adapter.primaryDrizzle ?? input.adapter.drizzle;
  if (!db) throw new Error("Schedule primary database is unavailable.");

  const result = await db.execute(buildAtomicScheduleStatusUpdate({
    itemId: input.itemId,
    schemaName: input.adapter.schemaName,
    status: input.status,
    tableName,
    updatedAt: input.updatedAt,
  }));
  if (!isRecord(result) || !Array.isArray(result.rows)) throw new Error("Schedule update returned an invalid result.");
  if (result.rows.length === 0) return null;
  if (result.rows.length !== 1) throw new Error("Schedule update returned an unexpected row count.");

  const row = result.rows[0];
  if (!isRecord(row) || row.id !== input.itemId || row.status !== input.status) {
    throw new Error("Schedule update returned an invalid row.");
  }
  return { id: input.itemId, status: input.status };
};
