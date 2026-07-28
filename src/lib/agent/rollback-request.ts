import { randomUUID } from "node:crypto";

import type { Payload } from "payload";

import {
  executeRollbackFromPayload,
  RollbackExecutionError,
  type RollbackExecutionResult,
} from "./rollback";
import {
  executeAtomicAgentRunRollbackClaim,
  executeAtomicAgentRunRollbackTransition,
  type AgentRunRollbackLifecycleState,
} from "./rollback-claim";
import { isRollbackPayloadExecutable } from "./rollback-parse";
import { buildAgentRunOwnerWhere } from "./run-access";
import {
  canRollbackAgentRunDetail,
  toAgentRunDetail,
  type AgentRunDetailView,
} from "./run-summary";

export type RollbackPayloadStore = Pick<Payload, "db" | "find" | "update">;
type ClaimRollbackSourceRun = (input: {
  claimToken: string;
  sourceRunId: number;
  updatedAt: string;
  userId: number;
}) => Promise<boolean>;
type TransitionRollbackSourceRun = (input: {
  claimToken: string;
  expectedState: AgentRunRollbackLifecycleState;
  nextAction: string;
  nextState: AgentRunRollbackLifecycleState;
  rollbackAvailable: boolean;
  sourceRunId: number;
  updatedAt: string;
  userId: number;
}) => Promise<boolean>;

export type TrustedRollbackRequestInput = {
  claimRollbackSourceRun?: ClaimRollbackSourceRun;
  createClaimToken?: () => string;
  executeRollback?: (rollbackPayload: unknown) => Promise<RollbackExecutionResult>;
  payload: RollbackPayloadStore;
  rollbackPayload?: unknown;
  sourceRunId?: null | number;
  transitionRollbackSourceRun?: TransitionRollbackSourceRun;
  userId: number;
};

export type TrustedRollbackRequestResult = {
  recordedAt: string;
  result: RollbackExecutionResult;
  sourceRunId: number;
};

const rollbackLifecycleNextAction = {
  consumed: (result: RollbackExecutionResult) =>
    `已执行撤销：${result.summary ?? `已执行回滚 ${result.strategy}`}`,
  failed: "撤销未执行，可稍后重试。",
  inProgress: "正在执行撤销。",
  indeterminate: "撤销结果不确定，需要人工核查。",
} as const;

const rollbackRequestUnavailableMessage =
  "回滚请求暂时无法安全处理，请稍后重试。";

const createSafeRollbackRequestError = (
  outcome: "indeterminate" | "zero_effect",
) =>
  outcome === "zero_effect"
    ? new Error(rollbackLifecycleNextAction.failed)
    : new Error(rollbackLifecycleNextAction.indeterminate);

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

const appendRollbackLifecycleStep = async (input: {
  level: "error" | "warn";
  message: string;
  payload: RollbackPayloadStore;
  recordedAt: string;
  sourceRun: AgentRunDetailView;
}) => {
  await input.payload.update({
    collection: "agent-runs",
    context: {
      skipAgentRunPlanSync: true,
    },
    data: {
      steps: [
        ...input.sourceRun.steps,
        {
          level: input.level,
          message: input.message,
          recordedAt: input.recordedAt,
        },
      ],
    },
    id: input.sourceRun.id,
    overrideAccess: true,
  });
};

export const executeTrustedRollbackRequest = async ({
  claimRollbackSourceRun,
  createClaimToken,
  executeRollback,
  payload,
  rollbackPayload,
  sourceRunId = null,
  transitionRollbackSourceRun,
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

  let sourceRun: null | Record<string, unknown>;

  try {
    sourceRun = await findOwnedRunById(payload, userId, sourceRunId);
  } catch {
    throw new Error(rollbackRequestUnavailableMessage);
  }

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
  const claimToken = (createClaimToken ?? randomUUID)();
  if (typeof claimToken !== "string" || claimToken.length === 0) {
    throw new Error(rollbackRequestUnavailableMessage);
  }
  const claim = claimRollbackSourceRun ?? ((input) =>
    executeAtomicAgentRunRollbackClaim({
      adapter: payload.db as unknown as Parameters<
        typeof executeAtomicAgentRunRollbackClaim
      >[0]["adapter"],
      ...input,
    }));
  const transition = transitionRollbackSourceRun ?? ((input) =>
    executeAtomicAgentRunRollbackTransition({
      adapter: payload.db as unknown as Parameters<
        typeof executeAtomicAgentRunRollbackTransition
      >[0]["adapter"],
      ...input,
    }));
  let claimed: boolean;

  try {
    claimed = await claim({
      claimToken,
      sourceRunId: sourceRunDetail.id,
      updatedAt: claimUpdatedAt,
      userId,
    });
  } catch {
    throw new Error(rollbackRequestUnavailableMessage);
  }

  if (!claimed) {
    throw new Error("这条 AgentRun 当前不可回滚，或已被其他请求占用。");
  }

  const rollbackExecutor = executeRollback ?? ((payloadToRollback: unknown) =>
    executeRollbackFromPayload(payloadToRollback, { userId }));
  const transitionClaim = (input: {
    expectedState: AgentRunRollbackLifecycleState;
    nextAction: string;
    nextState: AgentRunRollbackLifecycleState;
    rollbackAvailable: boolean;
    updatedAt: string;
  }) =>
    transition({
      claimToken,
      sourceRunId: sourceRunDetail.id,
      userId,
      ...input,
    });
  const markIndeterminate = async (
    expectedState: AgentRunRollbackLifecycleState,
  ) => {
    const recordedAt = new Date().toISOString();

    try {
      const transitioned = await transitionClaim({
        expectedState,
        nextAction: rollbackLifecycleNextAction.indeterminate,
        nextState: "indeterminate",
        rollbackAvailable: false,
        updatedAt: recordedAt,
      });

      if (!transitioned) {
        return;
      }
    } catch {
      return;
    }

    try {
      await appendRollbackLifecycleStep({
        level: "error",
        message: `ROLLBACK_INDETERMINATE sourceRun#${sourceRunDetail.id}`,
        payload,
        recordedAt,
        sourceRun: sourceRunDetail,
      });
    } catch {
      // The owner/token-bound unavailable state is already durable.
    }
  };
  let result: RollbackExecutionResult;

  try {
    result = await rollbackExecutor(storedRollbackPayload);
  } catch (error) {
    if (
      error instanceof RollbackExecutionError
      && error.outcome === "zero_effect"
    ) {
      const recordedAt = new Date().toISOString();

      try {
        await appendRollbackLifecycleStep({
          level: "error",
          message: `ROLLBACK_FAILED_ZERO_EFFECT sourceRun#${sourceRunDetail.id}`,
          payload,
          recordedAt,
          sourceRun: sourceRunDetail,
        });
      } catch {
        await markIndeterminate("in_progress");
        throw createSafeRollbackRequestError("indeterminate");
      }

      let released = false;

      try {
        released = await transitionClaim({
          expectedState: "in_progress",
          nextAction: rollbackLifecycleNextAction.failed,
          nextState: "failed",
          rollbackAvailable: true,
          updatedAt: recordedAt,
        });
      } catch {
        released = false;
      }

      if (released) {
        throw createSafeRollbackRequestError("zero_effect");
      }

      await markIndeterminate("in_progress");
      throw createSafeRollbackRequestError("indeterminate");
    }

    await markIndeterminate("in_progress");
    throw createSafeRollbackRequestError("indeterminate");
  }

  const recordedAt = new Date().toISOString();
  let consumed = false;

  try {
    consumed = await transitionClaim({
      expectedState: "in_progress",
      nextAction: rollbackLifecycleNextAction.consumed(result),
      nextState: "consumed",
      rollbackAvailable: false,
      updatedAt: recordedAt,
    });
  } catch {
    consumed = false;
  }

  if (!consumed) {
    await markIndeterminate("in_progress");
    throw createSafeRollbackRequestError("indeterminate");
  }

  try {
    await appendRollbackLifecycleStep({
      level: "warn",
      message: `ROLLBACK_CONSUMED sourceRun#${sourceRunDetail.id} strategy=${result.strategy}`,
      payload,
      recordedAt,
      sourceRun: sourceRunDetail,
    });
  } catch {
    await markIndeterminate("consumed");
    throw createSafeRollbackRequestError("indeterminate");
  }

  return {
    recordedAt,
    result,
    sourceRunId: sourceRunDetail.id,
  };
};
