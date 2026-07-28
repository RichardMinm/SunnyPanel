import { sql, type SQL } from "drizzle-orm";

type DrizzleExecutor = {
  execute: (query: SQL) => Promise<unknown>;
};

export type AgentRunRollbackClaimPostgresAdapter = {
  drizzle?: DrizzleExecutor;
  primaryDrizzle?: DrizzleExecutor;
  schemaName?: string;
  tableNameMap: Map<string, string>;
};

type AtomicAgentRunRollbackClaimInput = {
  schemaName?: string;
  sourceRunId: number;
  tableName: string;
  updatedAt: string;
  userId: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const agentRunTable = (
  input: Pick<AtomicAgentRunRollbackClaimInput, "schemaName" | "tableName">,
) =>
  input.schemaName
    ? sql`${sql.identifier(input.schemaName)}.${sql.identifier(input.tableName)}`
    : sql`${sql.identifier(input.tableName)}`;

/**
 * Claims an owned AgentRun in the database before any rollback effect runs.
 * The compare-and-set makes concurrent and retried requests fail closed.
 */
export const buildAtomicAgentRunRollbackClaim = (
  input: AtomicAgentRunRollbackClaimInput,
) => sql`
  UPDATE ${agentRunTable(input)}
  SET ${sql.identifier("rollback_available")} = ${false},
      ${sql.identifier("updated_at")} = ${input.updatedAt}
  WHERE ${sql.identifier("id")} = ${input.sourceRunId}
    AND ${sql.identifier("user_id")} = ${input.userId}
    AND ${sql.identifier("rollback_available")} = ${true}
  RETURNING ${sql.identifier("id")}
`;

export const executeAtomicAgentRunRollbackClaim = async (input: {
  adapter: AgentRunRollbackClaimPostgresAdapter;
  sourceRunId: number;
  updatedAt: string;
  userId: number;
}): Promise<boolean> => {
  const tableName = input.adapter.tableNameMap.get("agent_runs");
  if (!tableName) {
    throw new Error("AgentRun table mapping is unavailable.");
  }

  const db = input.adapter.primaryDrizzle ?? input.adapter.drizzle;
  if (!db) {
    throw new Error("AgentRun primary database is unavailable.");
  }

  const result = await db.execute(buildAtomicAgentRunRollbackClaim({
    schemaName: input.adapter.schemaName,
    sourceRunId: input.sourceRunId,
    tableName,
    updatedAt: input.updatedAt,
    userId: input.userId,
  }));

  if (!isRecord(result) || !Array.isArray(result.rows)) {
    throw new Error("AgentRun rollback claim returned an invalid result.");
  }

  if (result.rows.length === 0) {
    return false;
  }

  if (result.rows.length !== 1) {
    throw new Error("AgentRun rollback claim returned an unexpected row count.");
  }

  const row = result.rows[0];
  if (!isRecord(row) || row.id !== input.sourceRunId) {
    throw new Error("AgentRun rollback claim returned an invalid row.");
  }

  return true;
};
