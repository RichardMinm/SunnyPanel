import type {
  AgentIntent,
} from "@/lib/agent/schemas";

export type AgentActionReceiptClaim =
  | {
      receiptId: number;
      status: "claimed";
    }
  | {
      response: unknown;
      status: "replay";
    }
  | {
      status: "blocked";
    };

export type AgentActionReceiptStore = {
  claim: (input: {
    actionId: string;
    intent: AgentIntent["intent"];
    key: string;
    operation: AgentActionReceiptOperation;
    threadId: number;
    userId: number;
  }) => Promise<AgentActionReceiptClaim>;
  complete: (
    receiptId: number,
    response: unknown,
  ) => Promise<void>;
  markIndeterminate: (
    receiptId: number,
    error: unknown,
  ) => Promise<void>;
};

export type AgentActionReceiptOperation = "execute" | "rollback";

export class AgentActionReceiptBlockedError extends Error {
  constructor(actionId: string) {
    super(
      `Action ${actionId} already has an unfinished receipt and will not be executed again automatically.`,
    );
    this.name = "AgentActionReceiptBlockedError";
  }
}

export const buildAgentActionReceiptKey = ({
  actionId,
  operation = "execute",
  threadId,
}: {
  actionId: string;
  operation?: AgentActionReceiptOperation;
  threadId: number;
}) =>
  `agent-thread:${threadId}:action:${actionId}:operation:${operation}`;

export const runIdempotentAgentAction = async <TResult>({
  actionId,
  execute,
  intent,
  operation = "execute",
  store,
  threadId,
  userId,
}: {
  actionId: string;
  execute: () => Promise<TResult>;
  intent: AgentIntent["intent"];
  operation?: AgentActionReceiptOperation;
  store: AgentActionReceiptStore;
  threadId: number;
  userId: number;
}) => {
  const claim = await store.claim({
    actionId,
    intent,
    key: buildAgentActionReceiptKey({
      actionId,
      operation,
      threadId,
    }),
    operation,
    threadId,
    userId,
  });

  if (claim.status === "replay") {
    return claim.response as TResult;
  }

  if (claim.status === "blocked") {
    throw new AgentActionReceiptBlockedError(actionId);
  }

  try {
    const response = await execute();
    await store.complete(claim.receiptId, response);
    return response;
  } catch (error) {
    await store.markIndeterminate(claim.receiptId, error);
    throw error;
  }
};

type ReceiptDocument = {
  id: number;
  response?: unknown;
  status?: string;
};

type ActionReceiptPayload = {
  create: (input: {
    collection: "agent-action-receipts";
    data: Record<string, unknown>;
    overrideAccess: true;
  }) => Promise<ReceiptDocument>;
  find: (input: {
    collection: "agent-action-receipts";
    depth: 0;
    limit: 1;
    overrideAccess: true;
    pagination: false;
    where: Record<string, unknown>;
  }) => Promise<{ docs: ReceiptDocument[] }>;
  update: (input: {
    collection: "agent-action-receipts";
    data: Record<string, unknown>;
    id: number;
    overrideAccess: true;
  }) => Promise<ReceiptDocument>;
};

const parseStoredResponse = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as Record<string, unknown>;
};

export const createPayloadActionReceiptStore = (
  payload: ActionReceiptPayload,
): AgentActionReceiptStore => ({
  claim: async (input) => {
    try {
      const receipt = await payload.create({
        collection: "agent-action-receipts",
        data: {
          actionId: input.actionId,
          intent: input.intent,
          key: input.key,
          operation: input.operation,
          status: "pending",
          thread: input.threadId,
          user: input.userId,
        },
        overrideAccess: true,
      });

      return {
        receiptId: receipt.id,
        status: "claimed",
      };
    } catch (error) {
      const existing = await payload.find({
        collection: "agent-action-receipts",
        depth: 0,
        limit: 1,
        overrideAccess: true,
        pagination: false,
        where: {
          key: {
            equals: input.key,
          },
        },
      });
      const receipt = existing.docs[0];
      const response = parseStoredResponse(receipt?.response);

      if (receipt?.status === "succeeded" && response) {
        return {
          response,
          status: "replay",
        };
      }

      if (receipt) {
        return { status: "blocked" };
      }

      throw error;
    }
  },
  complete: async (receiptId, response) => {
    const responseRecord =
      response && typeof response === "object"
        ? (response as Record<string, unknown>)
        : null;
    await payload.update({
      collection: "agent-action-receipts",
      data: {
        completedAt: new Date().toISOString(),
        response,
        rollbackPayload:
          responseRecord?.lastRollbackPayload ??
          responseRecord?.rollbackPayload,
        status: "succeeded",
      },
      id: receiptId,
      overrideAccess: true,
    });
  },
  markIndeterminate: async (receiptId, error) => {
    await payload.update({
      collection: "agent-action-receipts",
      data: {
        completedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
        status: "indeterminate",
      },
      id: receiptId,
      overrideAccess: true,
    });
  },
});
