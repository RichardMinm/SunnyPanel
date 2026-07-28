export const validScheduleStatuses = ["planned", "done", "skipped", "canceled"] as const;
export type ScheduleStatus = typeof validScheduleStatuses[number];

type AuthUser = { id: number };
type StatusDocument = { id: number; status: unknown };
type AffectedDocument = {
  collection: string;
  documentId: number;
  operation: "create" | "update";
  visibility: "private" | "public" | "unknown";
};
type AtomicWhere = {
  and: [
    { id: { equals: number } },
    { status: { not_equals: "done" } },
  ];
};
type CompletionResult =
  | { code: string; ok: false }
  | {
    affectedDocuments: AffectedDocument[];
    ok: true;
    schedule: StatusDocument;
  };

export type ScheduleStatusDependencies = {
  atomicUpdateStatus: (input: {
    data: { status: ScheduleStatus };
    itemId: number;
    payload: unknown;
    user: AuthUser;
    where: AtomicWhere;
  }) => Promise<unknown>;
  completeScheduleItem: (input: {
    actor: { isAdministrator: true; userId: number };
    itemId: number;
    payload: unknown;
  }) => Promise<CompletionResult>;
  createTransactionalScheduleCompletionPayload: (input: { payload: unknown }) => unknown;
  getPayloadAuthResult: () => Promise<{ user: AuthUser | null }>;
  getPayloadClient: () => Promise<unknown>;
  readCurrentScheduleStatus: (input: {
    itemId: number;
    payload: unknown;
    user: AuthUser;
  }) => Promise<{ item: unknown | null; ok: true } | { ok: false }>;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isPositiveItemId = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

const isScheduleStatus = (value: unknown): value is ScheduleStatus =>
  typeof value === "string" && validScheduleStatuses.includes(value as ScheduleStatus);

const asStatusDocument = (value: unknown): StatusDocument | null =>
  isPlainObject(value) && isPositiveItemId(value.id) && typeof value.status === "string"
    ? { id: value.id, status: value.status }
    : null;

const boundedFailure = (status: number) =>
  Response.json({ message: "日程更新失败，请稍后重试" }, { status });

const success = (item: StatusDocument, affectedDocuments: AffectedDocument[]) =>
  Response.json({
    affectedDocuments: affectedDocuments.map((document) => ({
      collection: document.collection,
      documentId: document.documentId,
      operation: document.operation,
      visibility: document.visibility,
    })),
    item,
    success: true,
  });

/**
 * Pure request handler for the Schedule status endpoint. The direct status
 * path delegates its compare-and-update statement to the database adapter so
 * no application-level read can race the Schedule completion transaction.
 */
export const createScheduleStatusHandler = (dependencies: ScheduleStatusDependencies) => async (request: Request) => {
  const authResult = await dependencies.getPayloadAuthResult();
  if (!authResult.user) return Response.json({ message: "未登录" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "缺少参数或状态无效" }, { status: 400 });
  }
  if (!isPlainObject(body) || !isPositiveItemId(body.id) || !isScheduleStatus(body.status)) {
    return Response.json({ message: "缺少参数或状态无效" }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = await dependencies.getPayloadClient();
  } catch {
    return boundedFailure(500);
  }

  if (body.status === "done") {
    const result = await dependencies.completeScheduleItem({
      actor: { isAdministrator: true, userId: authResult.user.id },
      itemId: body.id,
      payload: dependencies.createTransactionalScheduleCompletionPayload({ payload }),
    });
    if (!result.ok) {
      const status = result.code === "invalid_reference" ? 400
        : result.code === "resource_not_found" ? 404
          : result.code === "transaction_unavailable" ? 503
            : 500;
      return boundedFailure(status);
    }
    const item = asStatusDocument(result.schedule);
    return item && item.id === body.id && item.status === "done"
      ? success(item, result.affectedDocuments)
      : boundedFailure(500);
  }

  const where: AtomicWhere = {
    and: [{ id: { equals: body.id } }, { status: { not_equals: "done" } }],
  };
  let updated: unknown;
  try {
    updated = await dependencies.atomicUpdateStatus({
      data: { status: body.status },
      itemId: body.id,
      payload,
      user: authResult.user,
      where,
    });
  } catch {
    return boundedFailure(500);
  }

  const item = asStatusDocument(updated);
  if (item) {
    return item.id === body.id && item.status === body.status
      ? success(item, [{ collection: "schedule-items", documentId: body.id, operation: "update", visibility: "private" }])
      : boundedFailure(500);
  }

  let current;
  try {
    current = await dependencies.readCurrentScheduleStatus({ itemId: body.id, payload, user: authResult.user });
  } catch {
    return boundedFailure(500);
  }
  if (!current.ok) return boundedFailure(500);
  const currentItem = asStatusDocument(current.item);
  if (currentItem === null) return Response.json({ message: "日程不存在" }, { status: 404 });
  if (currentItem.status === "done") {
    return Response.json({ message: "已完成日程只能通过撤销恢复" }, { status: 409 });
  }
  return boundedFailure(500);
};
