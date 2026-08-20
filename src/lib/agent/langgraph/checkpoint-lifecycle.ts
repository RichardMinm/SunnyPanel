import { PRODUCTION_GRAPH_VERSION } from "@/lib/agent/langgraph/topology";

export const SUNNY_AGENT_CHECKPOINT_NAMESPACE = "sunny-agent" as const;
export const DEFAULT_CHECKPOINT_RETENTION_DAYS = 30;
export const MAX_CHECKPOINT_RETENTION_DAYS = 3_650;

export type SunnyAgentCheckpointIdentity = Readonly<{
  compatible: boolean;
  threadId: number;
  userId: number;
  version: string;
}>;

export type CheckpointThreadRecord = Readonly<{
  lastSeenAt: Date | null;
  threadId: string;
}>;

export type CheckpointCleanupCandidate = Readonly<{
  reason: "expired" | "incompatible_expired" | "orphaned";
  threadId: string;
}>;

export type CheckpointThreadDeleter = Readonly<{
  deleteThread: (threadId: string) => Promise<void>;
}>;

export const buildSunnyAgentCheckpointThreadId = ({
  threadId,
  userId,
  version = PRODUCTION_GRAPH_VERSION,
}: {
  threadId: number;
  userId: number;
  version?: string;
}) => `${SUNNY_AGENT_CHECKPOINT_NAMESPACE}:${version}:${userId}:${threadId}`;

export const parseSunnyAgentCheckpointThreadId = (
  value: string,
): SunnyAgentCheckpointIdentity | null => {
  const match = /^sunny-agent:([^:]+):([1-9]\d*):([1-9]\d*)$/.exec(value);
  if (!match) return null;

  const userId = Number.parseInt(match[2], 10);
  const threadId = Number.parseInt(match[3], 10);
  if (!Number.isSafeInteger(userId) || !Number.isSafeInteger(threadId)) {
    return null;
  }

  return Object.freeze({
    compatible: match[1] === PRODUCTION_GRAPH_VERSION,
    threadId,
    userId,
    version: match[1],
  });
};

export const resolveCheckpointRetentionDays = (
  value: string | undefined,
) => {
  if (value === undefined || value.trim() === "") {
    return DEFAULT_CHECKPOINT_RETENTION_DAYS;
  }

  const parsed = Number(value);
  if (
    !Number.isInteger(parsed)
    || parsed < 1
    || parsed > MAX_CHECKPOINT_RETENTION_DAYS
  ) {
    throw new Error(
      `Checkpoint retention must be an integer from 1 to ${MAX_CHECKPOINT_RETENTION_DAYS} days.`,
    );
  }

  return parsed;
};

export const selectCheckpointCleanupCandidates = ({
  activeThreadKeys,
  cutoff,
  records,
  retentionEligibleThreadKeys,
}: {
  activeThreadKeys: ReadonlySet<string>;
  cutoff: Date;
  records: readonly CheckpointThreadRecord[];
  retentionEligibleThreadKeys: ReadonlySet<string>;
}): CheckpointCleanupCandidate[] => {
  const candidates: CheckpointCleanupCandidate[] = [];

  for (const record of records) {
    const identity = parseSunnyAgentCheckpointThreadId(record.threadId);
    if (!identity) continue;

    const businessKey = `${identity.userId}:${identity.threadId}`;
    if (!activeThreadKeys.has(businessKey)) {
      candidates.push({ reason: "orphaned", threadId: record.threadId });
      continue;
    }

    if (
      !retentionEligibleThreadKeys.has(businessKey)
      || !record.lastSeenAt
      || record.lastSeenAt > cutoff
    ) {
      continue;
    }

    candidates.push({
      reason: identity.compatible ? "expired" : "incompatible_expired",
      threadId: record.threadId,
    });
  }

  return candidates;
};

export const deleteAgentThreadWithCheckpoint = async ({
  checkpointer,
  deleteBusinessThread,
  threadId,
  userId,
}: {
  checkpointer: CheckpointThreadDeleter;
  deleteBusinessThread: () => Promise<void>;
  threadId: number;
  userId: number;
}) => {
  await checkpointer.deleteThread(
    buildSunnyAgentCheckpointThreadId({ threadId, userId }),
  );
  await deleteBusinessThread();
};
