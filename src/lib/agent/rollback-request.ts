import type { Payload } from "payload";

import { executeRollbackFromPayload, type RollbackExecutionResult } from "./rollback";
import { executeAtomicAgentRunRollbackClaim } from "./rollback-claim";
import { isRollbackPayloadExecutable } from "./rollback-parse";
import { buildAgentRunOwnerWhere } from "./run-access";
import { buildRollbackConsumedAgentRunPatch, canRollbackAgentRunDetail, toAgentRunDetail } from "./run-summary";

type RollbackPayloadStore = Pick<Payload, "db" | "find" | "update">;
type ClaimRollbackSourceRun = (input: {
  sourceRunId: number;
  updatedAt: string;
  userId: number;
}) => Promise<boolean>;

export type TrustedRollbackRequestInput = {
  claimRollbackSourceRun?: ClaimRollbackSourceRun;
  executeRollback?: (rollbackPayload: unknown) => Promise<RollbackExecutionResult>;
  payload: RollbackPayloadStore;
  rollbackPayload?: unknown;
  sourceRunId?: null | number;
  userId: number;
};

export type TrustedRollbackRequestResult = {
  recordedAt: string;
  result: RollbackExecutionResult;
  sourceRunId: number;
};

const findOwnedRunById = async (payload: RollbackPayloadStore, userId: number, sourceRunId: number) => {
  const runs = await payload.find({
    collection: "agent-runs",
    depth: 0,
    limit: 1,
    overrideAccess: true,
    where: buildAgentRunOwnerWhere(userId, { id: { equals: sourceRunId } }),
  });

  return (runs.docs[0] ?? null) as unknown as Record<string, unknown> | null;
};

export const executeTrustedRollbackRequest = async ({
  claimRollbackSourceRun,
  executeRollback,
  payload,
  rollbackPayload,
  sourceRunId = null,
  userId,
}: TrustedRollbackRequestInput): Promise<TrustedRollbackRequestResult> => {
  if (rollbackPayload !== undefined) {
    throw new Error("只接受 sourceRunId；客户端 rollbackPayload 已被拒绝。");
  }

  if (
    typeof sourceRunId !== "number"
    || !Number.isSafeInteger(sourceRunId)
    || sourceRunId <= 0
  ) {
    throw new Error("sourceRunId 必须是正安全整数。");
  }

  const sourceRun = await findOwnedRunById(payload, userId, sourceRunId);

  if (!sourceRun) {
    throw new Error("没有找到可回滚的 AgentRun，或当前用户无权访问。");
  }

  const sourceRunDetail = toAgentRunDetail(sourceRun);

  const storedRollbackPayload = sourceRun.rollbackPayload;

  if (
    !canRollbackAgentRunDetail(sourceRunDetail)
    || !isRollbackPayloadExecutable(storedRollbackPayload)
  ) {
    throw new Error("这条 AgentRun 当前不可回滚。");
  }

  const claimUpdatedAt = new Date().toISOString();
  const claim = claimRollbackSourceRun ?? ((input) =>
    executeAtomicAgentRunRollbackClaim({
      adapter: payload.db as unknown as Parameters<
        typeof executeAtomicAgentRunRollbackClaim
      >[0]["adapter"],
      ...input,
    }));
  const claimed = await claim({
    sourceRunId: sourceRunDetail.id,
    updatedAt: claimUpdatedAt,
    userId,
  });

  if (!claimed) {
    throw new Error("这条 AgentRun 当前不可回滚，或已被其他请求占用。");
  }

  const rollbackExecutor = executeRollback ?? ((payloadToRollback: unknown) =>
    executeRollbackFromPayload(payloadToRollback, { userId }));
  const result = await rollbackExecutor(storedRollbackPayload);
  const recordedAt = new Date().toISOString();

  await payload.update({
    collection: "agent-runs",
    context: {
      skipAgentRunPlanSync: true,
    },
    data: buildRollbackConsumedAgentRunPatch(sourceRunDetail, result, recordedAt),
    id: sourceRunDetail.id,
    overrideAccess: true,
  });

  return {
    recordedAt,
    result,
    sourceRunId: sourceRunDetail.id,
  };
};
