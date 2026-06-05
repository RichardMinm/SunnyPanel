import type { Payload } from "payload";

import { executeRollbackFromPayload, type RollbackExecutionResult } from "./rollback";
import { buildAgentRunOwnerWhere } from "./run-access";
import { buildRollbackConsumedAgentRunPatch, canRollbackAgentRunDetail, toAgentRunDetail } from "./run-summary";

type RollbackPayloadStore = Pick<Payload, "find" | "update">;

export type TrustedRollbackRequestInput = {
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
};

const payloadsMatch = (left: unknown, right: unknown) => stableStringify(left) === stableStringify(right);

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

const findOwnedRunByRollbackPayload = async (
  payload: RollbackPayloadStore,
  userId: number,
  rollbackPayload: unknown,
) => {
  const runs = await payload.find({
    collection: "agent-runs",
    depth: 0,
    limit: 20,
    overrideAccess: true,
    sort: "-startedAt",
    where: buildAgentRunOwnerWhere(userId, { rollbackAvailable: { equals: true } }),
  });

  return ((runs.docs as unknown as Array<Record<string, unknown>>).find((run) =>
    payloadsMatch(run.rollbackPayload, rollbackPayload),
  )) ?? null;
};

export const executeTrustedRollbackRequest = async ({
  executeRollback,
  payload,
  rollbackPayload,
  sourceRunId = null,
  userId,
}: TrustedRollbackRequestInput): Promise<TrustedRollbackRequestResult> => {
  const sourceRun =
    typeof sourceRunId === "number"
      ? await findOwnedRunById(payload, userId, sourceRunId)
      : rollbackPayload !== undefined
        ? await findOwnedRunByRollbackPayload(payload, userId, rollbackPayload)
        : null;

  if (!sourceRun) {
    throw new Error("没有找到可回滚的 AgentRun，或当前用户无权访问。");
  }

  const sourceRunDetail = toAgentRunDetail(sourceRun);

  if (!canRollbackAgentRunDetail(sourceRunDetail)) {
    throw new Error("这条 AgentRun 当前不可回滚。");
  }

  if (rollbackPayload !== undefined && !payloadsMatch(sourceRunDetail.rollbackPayload, rollbackPayload)) {
    throw new Error("rollbackPayload 与源 AgentRun 不一致，已拒绝执行。");
  }

  const rollbackExecutor = executeRollback ?? ((payloadToRollback: unknown) =>
    executeRollbackFromPayload(payloadToRollback, { userId }));
  const result = await rollbackExecutor(sourceRunDetail.rollbackPayload);
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
