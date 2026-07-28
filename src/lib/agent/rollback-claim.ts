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

export type AgentRunRollbackLifecycleState =
  | "consumed"
  | "failed"
  | "in_progress"
  | "indeterminate";

export type AtomicAgentRunRollbackClaimInput = {
  claimToken: string;
  schemaName?: string;
  sourceRunId: number;
  tableName: string;
  updatedAt: string;
  userId: number;
};

export type AtomicAgentRunRollbackTransitionInput = {
  claimToken: string;
  expectedState: AgentRunRollbackLifecycleState;
  nextAction: string;
  nextState: AgentRunRollbackLifecycleState;
  rollbackAvailable: boolean;
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

const rollbackClaimTrace = (input: {
  claimToken: string;
  state: AgentRunRollbackLifecycleState;
  updatedAt: string;
}) => sql`jsonb_build_object(
  'rollbackClaim',
  jsonb_build_object(
    'claimTokenHash', md5(${input.claimToken}),
    'state', ${input.state}::text,
    'updatedAt', ${input.updatedAt}::text
  )
)`;

/**
 * Claims an owned AgentRun in the database before any rollback effect runs.
 * The compare-and-set makes concurrent and retried requests fail closed.
 */
export const buildAtomicAgentRunRollbackClaim = (
  input: AtomicAgentRunRollbackClaimInput,
) => sql`
  UPDATE ${agentRunTable(input)}
  SET ${sql.identifier("rollback_available")} = ${false},
      ${sql.identifier("next_action")} = ${"正在执行撤销。"},
      ${sql.identifier("trace")} =
        COALESCE(${sql.identifier("trace")}, '{}'::jsonb)
        || ${rollbackClaimTrace({
          claimToken: input.claimToken,
          state: "in_progress",
          updatedAt: input.updatedAt,
        })},
      ${sql.identifier("updated_at")} = ${input.updatedAt}
  WHERE ${sql.identifier("id")} = ${input.sourceRunId}
    AND ${sql.identifier("user_id")} = ${input.userId}
    AND ${sql.identifier("rollback_available")} = ${true}
  RETURNING ${sql.identifier("id")}
`;

/**
 * Advances one owned claim only when both its secret token and current state
 * match. Claim tokens live only in the server-only trace JSON.
 */
export const buildAtomicAgentRunRollbackTransition = (
  input: AtomicAgentRunRollbackTransitionInput,
) => sql`
  UPDATE ${agentRunTable(input)}
  SET ${sql.identifier("rollback_available")} = ${input.rollbackAvailable},
      ${sql.identifier("next_action")} = ${input.nextAction},
      ${sql.identifier("trace")} =
        COALESCE(${sql.identifier("trace")}, '{}'::jsonb)
        || ${rollbackClaimTrace({
          claimToken: input.claimToken,
          state: input.nextState,
          updatedAt: input.updatedAt,
        })},
      ${sql.identifier("updated_at")} = ${input.updatedAt}
  WHERE ${sql.identifier("id")} = ${input.sourceRunId}
    AND ${sql.identifier("user_id")} = ${input.userId}
    AND ${sql.identifier("trace")} -> 'rollbackClaim' ->> 'claimTokenHash' = md5(${input.claimToken})
    AND ${sql.identifier("trace")} -> 'rollbackClaim' ->> 'state' = ${input.expectedState}
  RETURNING ${sql.identifier("id")}
`;

const executeOwnedRollbackMutation = async (input: {
  adapter: AgentRunRollbackClaimPostgresAdapter;
  label: string;
  query: SQL;
  sourceRunId: number;
}): Promise<boolean> => {
  const db = input.adapter.primaryDrizzle ?? input.adapter.drizzle;
  if (!db) {
    throw new Error("AgentRun primary database is unavailable.");
  }

  const result = await db.execute(input.query);

  if (!isRecord(result) || !Array.isArray(result.rows)) {
    throw new Error(`AgentRun rollback ${input.label} returned an invalid result.`);
  }

  if (result.rows.length === 0) {
    return false;
  }

  if (result.rows.length !== 1) {
    throw new Error(`AgentRun rollback ${input.label} returned an unexpected row count.`);
  }

  const row = result.rows[0];
  if (!isRecord(row) || row.id !== input.sourceRunId) {
    throw new Error(`AgentRun rollback ${input.label} returned an invalid row.`);
  }

  return true;
};

export const executeAtomicAgentRunRollbackClaim = async (input: {
  adapter: AgentRunRollbackClaimPostgresAdapter;
  claimToken: string;
  sourceRunId: number;
  updatedAt: string;
  userId: number;
}): Promise<boolean> => {
  const tableName = input.adapter.tableNameMap.get("agent_runs");
  if (!tableName) {
    throw new Error("AgentRun table mapping is unavailable.");
  }

  return executeOwnedRollbackMutation({
    adapter: input.adapter,
    label: "claim",
    query: buildAtomicAgentRunRollbackClaim({
      claimToken: input.claimToken,
      schemaName: input.adapter.schemaName,
      sourceRunId: input.sourceRunId,
      tableName,
      updatedAt: input.updatedAt,
      userId: input.userId,
    }),
    sourceRunId: input.sourceRunId,
  });
};

export const executeAtomicAgentRunRollbackTransition = async (input: {
  adapter: AgentRunRollbackClaimPostgresAdapter;
  claimToken: string;
  expectedState: AgentRunRollbackLifecycleState;
  nextAction: string;
  nextState: AgentRunRollbackLifecycleState;
  rollbackAvailable: boolean;
  sourceRunId: number;
  updatedAt: string;
  userId: number;
}): Promise<boolean> => {
  const tableName = input.adapter.tableNameMap.get("agent_runs");
  if (!tableName) {
    throw new Error("AgentRun table mapping is unavailable.");
  }

  return executeOwnedRollbackMutation({
    adapter: input.adapter,
    label: "transition",
    query: buildAtomicAgentRunRollbackTransition({
      claimToken: input.claimToken,
      expectedState: input.expectedState,
      nextAction: input.nextAction,
      nextState: input.nextState,
      rollbackAvailable: input.rollbackAvailable,
      schemaName: input.adapter.schemaName,
      sourceRunId: input.sourceRunId,
      tableName,
      updatedAt: input.updatedAt,
      userId: input.userId,
    }),
    sourceRunId: input.sourceRunId,
  });
};
