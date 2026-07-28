import { getPayloadClient } from "@/lib/payload/client";
import {
  normalizePlanLinkedContent,
  removePlanLink,
  type PlanLinkedContent,
} from "@/lib/core-linkage/plan-links";
import {
  unlinkTimelineFromPlan,
  type CoreLinkagePayload,
} from "@/lib/core-linkage/service";
import type { User } from "@/payload-types";
import type { Payload } from "payload";
import { commitTransaction, createLocalReq } from "payload";

import { recordAgentRollbackExecuted } from "./audit";
import { parseRollbackPayload } from "./rollback-parse";

export type { RollbackPayload } from "./rollback-parse";
export { isRollbackPayloadExecutable, parseRollbackPayload } from "./rollback-parse";

export type RollbackExecutionResult = {
  auditWarning?: string;
  affectedDocuments?: RollbackAffectedDocument[];
  collection: string;
  documentId: number;
  documentIds?: number[];
  strategy: string;
  summary?: string;
};

export type RollbackEffectOutcome = "indeterminate" | "zero_effect";

export class RollbackExecutionError extends Error {
  readonly outcome: RollbackEffectOutcome;

  constructor(
    message: string,
    outcome: RollbackEffectOutcome,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "RollbackExecutionError";
    this.outcome = outcome;
  }
}

export type RollbackAffectedDocument = {
  collection: string;
  documentId: number;
  operation: "create" | "delete" | "update";
  visibility: "unknown";
};

type RollbackTransactionOptions = {
  accessMode: "read write";
  isolationLevel: "serializable";
};

type RollbackTransactionRunner = <T>(
  userId: number,
  operation: (payload: RollbackPayloadClient) => Promise<T>,
  options: RollbackTransactionOptions,
) => Promise<T>;

type RollbackPayloadClient = {
  create: (args: unknown) => Promise<unknown>;
  delete: (args: unknown) => Promise<unknown>;
  findByID: (args: unknown) => Promise<null | unknown>;
  runInTransaction?: RollbackTransactionRunner;
  update: (args: unknown) => Promise<unknown>;
};

type RollbackExecutionOptions = {
  payload?: RollbackPayloadClient;
  persistAudit?: boolean;
  recordAudit?: RollbackAuditRecorder;
  userId?: number;
};

const isTrustedUserId = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

const bindRollbackPayloadToUser = (
  payload: RollbackPayloadClient,
  userId: number,
): RollbackPayloadClient => {
  const user = { collection: "users", id: userId } as User;
  const withUser = (args: unknown) =>
    args && typeof args === "object" && !Array.isArray(args)
      ? { ...(args as Record<string, unknown>), user }
      : args;

  return {
    create: (args) => payload.create(withUser(args)),
    delete: (args) => payload.delete(withUser(args)),
    findByID: (args) => payload.findByID(withUser(args)),
    update: (args) => payload.update(withUser(args)),
  };
};

type RollbackTransactionRequest = {
  transactionID?: number | Promise<number | string> | string;
};

class ScheduleRollbackTransactionUnavailableError extends RollbackExecutionError {
  constructor() {
    super(
      "Schedule completion rollback transaction is unavailable.",
      "zero_effect",
    );
    this.name = "ScheduleRollbackTransactionUnavailableError";
  }
}

const scheduleRollbackTransactionOptions: RollbackTransactionOptions = {
  accessMode: "read write",
  isolationLevel: "serializable",
};

const beginScheduleRollbackTransaction = async (input: {
  options: RollbackTransactionOptions;
  payload: Pick<Payload, "db">;
  req: RollbackTransactionRequest;
}): Promise<boolean> => {
  if (input.req.transactionID != null) {
    return false;
  }

  const transactionID = await input.payload.db.beginTransaction(input.options);
  if (transactionID == null) {
    return false;
  }

  input.req.transactionID = transactionID;
  return true;
};

const rollbackPayloadTransaction = async (input: {
  payload: Pick<Payload, "db">;
  req: RollbackTransactionRequest;
}): Promise<boolean> => {
  const transactionID = input.req.transactionID;

  try {
    if (transactionID == null) {
      return false;
    }

    await input.payload.db.rollbackTransaction(await transactionID);
    return true;
  } catch {
    return false;
  } finally {
    delete input.req.transactionID;
  }
};

/**
 * Production-only Schedule rollback boundary. Direct CRUD is inert so a
 * missing/failed transaction can never degrade to partial reverse writes.
 */
const createTransactionalRollbackPayload = (input: {
  payload: Payload;
}): RollbackPayloadClient => {
  const outsideTransaction = async (): Promise<never> => {
    throw new Error("Schedule completion rollback CRUD requires its transaction runner.");
  };

  return {
    create: outsideTransaction,
    delete: outsideTransaction,
    findByID: outsideTransaction,
    update: outsideTransaction,
    runInTransaction: async <T>(
      userId: number,
      operation: (payload: RollbackPayloadClient) => Promise<T>,
      options: RollbackTransactionOptions,
    ): Promise<T> => {
      let req: Awaited<ReturnType<typeof createLocalReq>>;

      try {
        req = await createLocalReq({ user: { id: userId } as never }, input.payload);
        const started = await beginScheduleRollbackTransaction({
          options,
          payload: input.payload,
          req,
        });

        if (!started) {
          throw new ScheduleRollbackTransactionUnavailableError();
        }
      } catch {
        throw new ScheduleRollbackTransactionUnavailableError();
      }

      const withReq = (args: unknown) =>
        args && typeof args === "object" && !Array.isArray(args)
          ? { ...(args as Record<string, unknown>), req }
          : args;
      const transactionPayload: RollbackPayloadClient = {
        create: (args) => input.payload.create(withReq(args) as never),
        delete: (args) => input.payload.delete(withReq(args) as never),
        findByID: (args) => input.payload.findByID(withReq(args) as never),
        update: (args) => input.payload.update(withReq(args) as never),
      };

      try {
        const result = await operation(transactionPayload);
        await commitTransaction(req);
        return result;
      } catch (error) {
        const rolledBack = await rollbackPayloadTransaction({
          payload: input.payload,
          req,
        });

        if (!rolledBack) {
          throw new RollbackExecutionError(
            "Schedule completion rollback could not be reconciled safely.",
            "indeterminate",
            { cause: error },
          );
        }

        throw new RollbackExecutionError(
          "Schedule completion rollback could not be reconciled safely.",
          "zero_effect",
          { cause: error },
        );
      }
    },
  };
};

const scheduleStatusValues = new Set(["canceled", "done", "planned", "skipped"]);

type RollbackAuditRecorder = (args: {
  result: RollbackExecutionResult;
  rollbackPayload: unknown;
  userId?: number;
}) => Promise<void>;

const affectedDocument = (
  collection: string,
  documentId: number,
  operation: RollbackAffectedDocument["operation"],
): RollbackAffectedDocument => ({
  collection,
  documentId,
  operation,
  visibility: "unknown",
});

const summarizeAffectedDocuments = (strategy: string, affectedDocuments: RollbackAffectedDocument[]) =>
  `已执行回滚 ${strategy}，影响 ${affectedDocuments.length} 个对象：${affectedDocuments
    .map((document) => `${document.collection}#${document.documentId} ${document.operation}`)
    .join("；")}`;

const buildRollbackResult = ({
  affectedDocuments,
  collection,
  documentId,
  documentIds,
  strategy,
}: {
  affectedDocuments: RollbackAffectedDocument[];
  collection: string;
  documentId: number;
  documentIds?: number[];
  strategy: string;
}): RollbackExecutionResult => ({
  affectedDocuments,
  collection,
  documentId,
  ...(documentIds ? { documentIds } : {}),
  strategy,
  summary: summarizeAffectedDocuments(strategy, affectedDocuments),
});

const isDocumentNotFoundError = (error: unknown) => {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    message?: unknown;
    status?: unknown;
    statusCode?: unknown;
  };

  return (
    candidate.status === 404 ||
    candidate.statusCode === 404 ||
    (typeof candidate.message === "string" && /not found|未找到/i.test(candidate.message))
  );
};

const getLinkedContentRelationId = (item: Record<string, unknown>) => {
  const value = item.value;

  return typeof value === "number"
    ? value
    : value && typeof value === "object" && !Array.isArray(value) && typeof (value as { id?: unknown }).id === "number"
      ? (value as { id: number }).id
      : null;
};

const normalizeLinkedContentForRollback = (value: unknown) => {
  if (value == null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error("Plan linkedContent 结构异常，无法安全自动回滚，请人工处理。");
  }

  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`Plan linkedContent.${index} 结构异常，无法安全自动回滚，请人工处理。`);
    }

    const record = item as Record<string, unknown>;
    const relationTo = record.relationTo;
    const relationId = getLinkedContentRelationId(record);

    if (typeof relationTo !== "string" || typeof relationId !== "number") {
      throw new Error(`Plan linkedContent.${index} 缺少有效 relationTo/value，无法安全自动回滚，请人工处理。`);
    }

    return record;
  });
};

const expectedChecklistLinkId = (expectedAddedLink: unknown, fallbackChecklistId: number) => {
  if (!expectedAddedLink || typeof expectedAddedLink !== "object" || Array.isArray(expectedAddedLink)) {
    return fallbackChecklistId;
  }

  const record = expectedAddedLink as Record<string, unknown>;

  return record.relationTo === "checklists" && typeof record.value === "number"
    ? record.value
    : fallbackChecklistId;
};

const persistRollbackAudit = async (
  rollbackPayload: unknown,
  result: RollbackExecutionResult,
  recordAudit: RollbackAuditRecorder = recordAgentRollbackExecuted,
  userId?: number,
): Promise<string | undefined> => {
  try {
    await recordAudit({
      result,
      rollbackPayload,
      userId,
    });
  } catch {
    return "回滚已执行，但审计记录写入失败。";
  }

  return undefined;
};

const pickScheduleSnapshotData = (snapshot: unknown) => {
  if (typeof snapshot !== "object" || snapshot === null || Array.isArray(snapshot)) {
    return null;
  }

  const record = snapshot as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  const fields = [
    "agentBrief",
    "category",
    "conflictNote",
    "createdBy",
    "date",
    "description",
    "endTime",
    "isAllDay",
    "priority",
    "relatedChecklist",
    "relatedChecklistItemKey",
    "relatedPlan",
    "sourceType",
    "startTime",
    "status",
    "title",
  ];

  for (const field of fields) {
    if (field in record) {
      const value = record[field];
      data[field] = (
        field === "relatedChecklist"
        || field === "relatedPlan"
      ) && value && typeof value === "object" && !Array.isArray(value)
        && typeof (value as { id?: unknown }).id === "number"
        ? (value as { id: number }).id
        : value;
    }
  }

  return Object.keys(data).length > 0 ? data : null;
};

const pickTimelineSnapshotData = (snapshot: unknown) => {
  if (typeof snapshot !== "object" || snapshot === null || Array.isArray(snapshot)) {
    return null;
  }

  const record = snapshot as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  const fields = [
    "description",
    "eventDate",
    "isFeatured",
    "relatedChecklist",
    "relatedPlan",
    "relatedPost",
    "relatedScheduleItem",
    "relatedTaskKey",
    "relatedUpdate",
    "sortOrder",
    "sourceType",
    "status",
    "title",
    "type",
    "visibility",
  ];

  for (const field of fields) {
    if (field in record) {
      data[field] = record[field];
    }
  }

  return Object.keys(data).length > 0 ? data : null;
};

const pickChecklistSnapshotData = (snapshot: unknown) => {
  if (typeof snapshot !== "object" || snapshot === null || Array.isArray(snapshot)) {
    return null;
  }

  const record = snapshot as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  const fields = [
    "groups",
    "publishedAt",
    "slug",
    "status",
    "summary",
    "title",
    "visibility",
  ];

  for (const field of fields) {
    if (field in record) {
      data[field] = record[field];
    }
  }

  return Object.keys(data).length > 0 ? data : null;
};

type ScheduleRollbackPosition = "after" | "before";

type ScheduleRollbackPlanRemoval = {
  planId: number;
  timelineEventId: number;
};

const scheduleRollbackFailure = () =>
  new Error("Schedule completion rollback state is divergent and cannot be reconciled safely.");

const asRollbackRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const canonicalRollbackValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(canonicalRollbackValue);
  }

  const record = asRollbackRecord(value);
  if (!record) {
    return value;
  }

  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .flatMap((key) =>
        record[key] === undefined
          ? []
          : [[key, canonicalRollbackValue(record[key])]],
      ),
  );
};

const sameRollbackValue = (left: unknown, right: unknown) =>
  JSON.stringify(canonicalRollbackValue(left)) === JSON.stringify(canonicalRollbackValue(right));

const requireTimelineSnapshotData = (
  snapshot: unknown,
): null | Record<string, unknown> => {
  if (snapshot == null) {
    return null;
  }

  const data = pickTimelineSnapshotData(snapshot);
  if (!data) {
    throw scheduleRollbackFailure();
  }

  return data;
};

const readScheduleRollbackDocument = async (
  payload: RollbackPayloadClient,
  collection: "checklists" | "plans" | "schedule-items" | "timeline-events",
  id: number,
): Promise<Record<string, unknown> | null> => {
  try {
    const document = await payload.findByID({
      collection,
      depth: 0,
      id,
      overrideAccess: true,
    });
    const record = asRollbackRecord(document);

    if (!record) {
      return null;
    }

    return record.id === id ? record : null;
  } catch (error) {
    if (isDocumentNotFoundError(error)) {
      return null;
    }

    throw scheduleRollbackFailure();
  }
};

const classifyExistingScheduleRollbackSnapshot = (input: {
  after: unknown;
  before: unknown;
  current: unknown;
}): ScheduleRollbackPosition => {
  if (sameRollbackValue(input.current, input.before)) {
    return "before";
  }

  if (sameRollbackValue(input.current, input.after)) {
    return "after";
  }

  throw scheduleRollbackFailure();
};

const classifyTimelineScheduleRollbackSnapshot = (input: {
  after: Record<string, unknown>;
  before: null | Record<string, unknown>;
  current: null | Record<string, unknown>;
}): ScheduleRollbackPosition => {
  if (!input.current) {
    if (input.before == null) {
      return "before";
    }

    throw scheduleRollbackFailure();
  }

  const current = pickTimelineSnapshotData(input.current);
  if (!current) {
    throw scheduleRollbackFailure();
  }

  if (input.before && sameRollbackValue(current, input.before)) {
    return "before";
  }

  if (sameRollbackValue(current, input.after)) {
    return "after";
  }

  throw scheduleRollbackFailure();
};

const normalizeScheduleRollbackPlanLinks = (value: unknown): PlanLinkedContent => {
  try {
    const links = normalizePlanLinkedContent(value);
    const keys = links.map((link) => `${link.relationTo}:${link.value}`);

    if (new Set(keys).size !== keys.length) {
      throw scheduleRollbackFailure();
    }

    return links;
  } catch {
    throw scheduleRollbackFailure();
  }
};

const countTimelinePlanLink = (links: PlanLinkedContent, timelineEventId: number) =>
  links.filter((link) =>
    link.relationTo === "timeline-events" && link.value === timelineEventId,
  ).length;

const validateScheduleRollbackPlanTransition = (input: {
  afterLinkedContent?: unknown;
  beforeLinkedContent: unknown;
  timelineEventId: number;
}) => {
  const before = normalizeScheduleRollbackPlanLinks(input.beforeLinkedContent);
  if (countTimelinePlanLink(before, input.timelineEventId) !== 0) {
    throw scheduleRollbackFailure();
  }

  if (input.afterLinkedContent !== undefined) {
    const after = normalizeScheduleRollbackPlanLinks(input.afterLinkedContent);
    if (countTimelinePlanLink(after, input.timelineEventId) !== 1) {
      throw scheduleRollbackFailure();
    }
  }
};

const dedupeRollbackAffectedDocuments = (
  documents: RollbackAffectedDocument[],
) => documents.filter((document, index) =>
  documents.findIndex((candidate) =>
    candidate.collection === document.collection
    && candidate.documentId === document.documentId
    && candidate.operation === document.operation,
  ) === index,
);

const executeScheduleCompletionRollbackInTransaction = async (input: {
  parsed: NonNullable<ReturnType<typeof parseRollbackPayload>>;
  payload: RollbackPayloadClient;
}): Promise<RollbackAffectedDocument[]> => {
  const target = input.parsed.target;
  const scheduleItemId = target?.itemId ?? target?.documentId;
  const outerTimelineEventId = target?.timelineEventId;
  if (
    !target
    || !isTrustedUserId(scheduleItemId)
    || !isTrustedUserId(outerTimelineEventId)
  ) {
    throw scheduleRollbackFailure();
  }

  const beforeSnapshot = asRollbackRecord(input.parsed.beforeSnapshot);
  const afterSnapshot = asRollbackRecord(input.parsed.afterSnapshot);
  const beforeSchedule = pickScheduleSnapshotData(beforeSnapshot?.schedule);
  const afterSchedule = pickScheduleSnapshotData(afterSnapshot?.schedule);
  const afterOuterTimeline = requireTimelineSnapshotData(afterSnapshot?.timelineEvent);
  const beforeOuterTimeline = requireTimelineSnapshotData(beforeSnapshot?.timelineEvent);
  if (!beforeSnapshot || !afterSnapshot || !beforeSchedule || !afterSchedule || !afterOuterTimeline) {
    throw scheduleRollbackFailure();
  }

  const checklistId = isTrustedUserId(target.checklistId)
    ? target.checklistId
    : null;
  const checklistCompletion = asRollbackRecord(beforeSnapshot.checklistCompletion);
  const checklistCompletionBefore = asRollbackRecord(checklistCompletion?.beforeSnapshot);
  const checklistCompletionTarget = asRollbackRecord(checklistCompletion?.target);
  const beforeChecklistGroups = checklistCompletionBefore?.groups ?? beforeSnapshot.checklistGroups;
  const afterChecklistGroups = afterSnapshot.checklistGroups;
  if (
    checklistId != null
    && (!Array.isArray(beforeChecklistGroups) || !Array.isArray(afterChecklistGroups))
  ) {
    throw scheduleRollbackFailure();
  }

  let nestedTimelineEventId: number | null = null;
  let beforeNestedTimeline: null | Record<string, unknown> = null;
  let afterNestedTimeline: null | Record<string, unknown> = null;
  if (checklistCompletion) {
    if (
      checklistCompletion.strategy !== "restore_checklist_groups_and_timeline"
      || checklistCompletionTarget?.collection !== "checklists"
      || checklistCompletionTarget.documentId !== checklistId
      || !isTrustedUserId(checklistCompletionTarget.timelineEventId)
    ) {
      throw scheduleRollbackFailure();
    }

    nestedTimelineEventId = checklistCompletionTarget.timelineEventId;
    const nestedBeforeSnapshot = checklistCompletionBefore?.timelineEvent;
    const nestedBeforeRecord = asRollbackRecord(nestedBeforeSnapshot);
    if (
      nestedBeforeRecord
      && nestedBeforeRecord.id !== nestedTimelineEventId
    ) {
      throw scheduleRollbackFailure();
    }
    beforeNestedTimeline = requireTimelineSnapshotData(nestedBeforeSnapshot);
    afterNestedTimeline = requireTimelineSnapshotData(afterSnapshot.checklistTimelineEvent);
    if (!afterNestedTimeline) {
      throw scheduleRollbackFailure();
    }
  } else if (
    checklistId != null
    && !sameRollbackValue(beforeChecklistGroups, afterChecklistGroups)
  ) {
    throw scheduleRollbackFailure();
  }

  const nestedPlanRemoval: ScheduleRollbackPlanRemoval | null = (() => {
    if (checklistCompletionBefore?.planLinkChanged !== true) {
      return null;
    }

    const planId = checklistCompletionTarget?.planId;
    if (!isTrustedUserId(planId) || !isTrustedUserId(nestedTimelineEventId)) {
      throw scheduleRollbackFailure();
    }

    validateScheduleRollbackPlanTransition({
      beforeLinkedContent: checklistCompletionBefore.planLinkedContent,
      timelineEventId: nestedTimelineEventId,
    });
    return {
      planId,
      timelineEventId: nestedTimelineEventId,
    };
  })();

  const schedulePlanLink = asRollbackRecord(beforeSnapshot.schedulePlanLink);
  const outerPlanRemoval: ScheduleRollbackPlanRemoval | null = (() => {
    if (schedulePlanLink?.changed !== true) {
      return null;
    }

    const planId = isTrustedUserId(schedulePlanLink.planId)
      ? schedulePlanLink.planId
      : target.planId;
    if (!isTrustedUserId(planId)) {
      throw scheduleRollbackFailure();
    }

    validateScheduleRollbackPlanTransition({
      afterLinkedContent: schedulePlanLink.afterLinkedContent,
      beforeLinkedContent: schedulePlanLink.beforeLinkedContent,
      timelineEventId: outerTimelineEventId,
    });
    return {
      planId,
      timelineEventId: outerTimelineEventId,
    };
  })();

  // Every read and classification happens before the first reverse write.
  const currentSchedule = await readScheduleRollbackDocument(
    input.payload,
    "schedule-items",
    scheduleItemId,
  );
  if (!currentSchedule) {
    throw scheduleRollbackFailure();
  }
  const currentScheduleData = pickScheduleSnapshotData(currentSchedule);
  if (!currentScheduleData) {
    throw scheduleRollbackFailure();
  }
  const schedulePosition = classifyExistingScheduleRollbackSnapshot({
    after: afterSchedule,
    before: beforeSchedule,
    current: currentScheduleData,
  });

  let checklistPosition: ScheduleRollbackPosition | null = null;
  if (checklistId != null) {
    const currentChecklist = await readScheduleRollbackDocument(
      input.payload,
      "checklists",
      checklistId,
    );
    if (!currentChecklist) {
      throw scheduleRollbackFailure();
    }
    checklistPosition = classifyExistingScheduleRollbackSnapshot({
      after: afterChecklistGroups,
      before: beforeChecklistGroups,
      current: currentChecklist.groups,
    });
  }

  const currentOuterTimeline = await readScheduleRollbackDocument(
    input.payload,
    "timeline-events",
    outerTimelineEventId,
  );
  const outerTimelinePosition = classifyTimelineScheduleRollbackSnapshot({
    after: afterOuterTimeline,
    before: beforeOuterTimeline,
    current: currentOuterTimeline,
  });

  let nestedTimelinePosition: ScheduleRollbackPosition | null = null;
  if (
    nestedTimelineEventId != null
    && afterNestedTimeline
  ) {
    const currentNestedTimeline = await readScheduleRollbackDocument(
      input.payload,
      "timeline-events",
      nestedTimelineEventId,
    );
    nestedTimelinePosition = classifyTimelineScheduleRollbackSnapshot({
      after: afterNestedTimeline,
      before: beforeNestedTimeline,
      current: currentNestedTimeline,
    });
  }

  const planRemovals = [nestedPlanRemoval, outerPlanRemoval].filter(
    (removal): removal is ScheduleRollbackPlanRemoval => removal != null,
  );
  const currentPlanLinks = new Map<number, PlanLinkedContent>();
  for (const planId of new Set(planRemovals.map((removal) => removal.planId))) {
    const currentPlan = await readScheduleRollbackDocument(
      input.payload,
      "plans",
      planId,
    );
    if (!currentPlan) {
      throw scheduleRollbackFailure();
    }
    currentPlanLinks.set(
      planId,
      normalizeScheduleRollbackPlanLinks(currentPlan.linkedContent),
    );
  }

  const planRemovalPositions = new Map<ScheduleRollbackPlanRemoval, ScheduleRollbackPosition>();
  for (const removal of planRemovals) {
    const links = currentPlanLinks.get(removal.planId);
    if (!links) {
      throw scheduleRollbackFailure();
    }
    const count = countTimelinePlanLink(links, removal.timelineEventId);
    if (count > 1) {
      throw scheduleRollbackFailure();
    }
    planRemovalPositions.set(removal, count === 0 ? "before" : "after");
  }

  const affectedDocuments: RollbackAffectedDocument[] = [];
  const applyPlanRemoval = async (removal: ScheduleRollbackPlanRemoval | null) => {
    if (!removal || planRemovalPositions.get(removal) === "before") {
      return;
    }

    const current = currentPlanLinks.get(removal.planId);
    if (!current) {
      throw scheduleRollbackFailure();
    }
    const next = removePlanLink(current, {
      relationTo: "timeline-events",
      value: removal.timelineEventId,
    });
    if (sameRollbackValue(current, next)) {
      throw scheduleRollbackFailure();
    }

    const written = asRollbackRecord(await input.payload.update({
      collection: "plans",
      data: { linkedContent: next },
      depth: 0,
      id: removal.planId,
      overrideAccess: true,
    }));
    if (
      !written
      || written.id !== removal.planId
      || !sameRollbackValue(
        normalizeScheduleRollbackPlanLinks(written.linkedContent),
        next,
      )
    ) {
      throw scheduleRollbackFailure();
    }
    currentPlanLinks.set(removal.planId, next);
    affectedDocuments.push(affectedDocument("plans", removal.planId, "update"));
  };

  const restoreTimeline = async (inputTimeline: {
    before: null | Record<string, unknown>;
    id: number;
    position: ScheduleRollbackPosition | null;
  }) => {
    if (inputTimeline.position !== "after") {
      return;
    }

    if (inputTimeline.before) {
      const written = asRollbackRecord(await input.payload.update({
        collection: "timeline-events",
        data: inputTimeline.before,
        depth: 0,
        id: inputTimeline.id,
        overrideAccess: true,
      }));
      if (
        !written
        || written.id !== inputTimeline.id
        || !sameRollbackValue(
          pickTimelineSnapshotData(written),
          inputTimeline.before,
        )
      ) {
        throw scheduleRollbackFailure();
      }
      affectedDocuments.push(
        affectedDocument("timeline-events", inputTimeline.id, "update"),
      );
      return;
    }

    await input.payload.delete({
      collection: "timeline-events",
      id: inputTimeline.id,
      overrideAccess: true,
    });
    affectedDocuments.push(
      affectedDocument("timeline-events", inputTimeline.id, "delete"),
    );
  };

  await applyPlanRemoval(nestedPlanRemoval);
  if (nestedTimelineEventId != null) {
    await restoreTimeline({
      before: beforeNestedTimeline,
      id: nestedTimelineEventId,
      position: nestedTimelinePosition,
    });
  }
  await applyPlanRemoval(outerPlanRemoval);
  await restoreTimeline({
    before: beforeOuterTimeline,
    id: outerTimelineEventId,
    position: outerTimelinePosition,
  });

  if (checklistId != null && checklistPosition === "after") {
    const written = asRollbackRecord(await input.payload.update({
      collection: "checklists",
      context: { skipChecklistTimelineSync: true },
      data: { groups: beforeChecklistGroups },
      depth: 0,
      id: checklistId,
      overrideAccess: true,
    }));
    if (
      !written
      || written.id !== checklistId
      || !sameRollbackValue(written.groups, beforeChecklistGroups)
    ) {
      throw scheduleRollbackFailure();
    }
    affectedDocuments.push(affectedDocument("checklists", checklistId, "update"));
  }

  if (schedulePosition === "after") {
    const written = asRollbackRecord(await input.payload.update({
      collection: "schedule-items",
      data: beforeSchedule,
      depth: 0,
      id: scheduleItemId,
      overrideAccess: true,
    }));
    if (
      !written
      || written.id !== scheduleItemId
      || !sameRollbackValue(
        pickScheduleSnapshotData(written),
        beforeSchedule,
      )
    ) {
      throw scheduleRollbackFailure();
    }
    affectedDocuments.push(
      affectedDocument("schedule-items", scheduleItemId, "update"),
    );
  }

  return dedupeRollbackAffectedDocuments(affectedDocuments);
};

const executeTransactionalScheduleCompletionRollback = async (input: {
  parsed: NonNullable<ReturnType<typeof parseRollbackPayload>>;
  payload: RollbackPayloadClient;
  userId: number;
}): Promise<RollbackAffectedDocument[]> => {
  if (!input.payload.runInTransaction) {
    throw new ScheduleRollbackTransactionUnavailableError();
  }

  try {
    return await input.payload.runInTransaction(
      input.userId,
      async (transactionPayload) => executeScheduleCompletionRollbackInTransaction({
        parsed: input.parsed,
        payload: bindRollbackPayloadToUser(transactionPayload, input.userId),
      }),
      scheduleRollbackTransactionOptions,
    );
  } catch (error) {
    if (error instanceof RollbackExecutionError) {
      throw error;
    }

    throw new RollbackExecutionError(
      "Schedule completion rollback could not be reconciled safely.",
      "indeterminate",
      { cause: error },
    );
  }
};

const modifiedRecordFields: Record<string, ReadonlySet<string>> = {
  checklists: new Set(["publishedAt", "status", "summary", "title", "visibility"]),
  plans: new Set([
    "description",
    "domain",
    "dueDate",
    "executionMode",
    "priority",
    "startDate",
    "state",
    "status",
    "title",
    "visibility",
  ]),
  "schedule-items": new Set([
    "category",
    "date",
    "description",
    "endTime",
    "isAllDay",
    "priority",
    "startTime",
    "status",
    "title",
  ]),
  "timeline-events": new Set([
    "description",
    "eventDate",
    "isFeatured",
    "sortOrder",
    "status",
    "title",
    "type",
    "visibility",
  ]),
};

const pickModifiedRecordSnapshot = (collection: string, snapshot: unknown) => {
  if (typeof snapshot !== "object" || snapshot === null || Array.isArray(snapshot)) {
    return null;
  }

  const fields = modifiedRecordFields[collection];
  if (!fields) {
    return null;
  }

  const record = snapshot as Record<string, unknown>;
  const data = Object.fromEntries(
    Object.entries(record).filter(([field]) => fields.has(field)),
  );

  return Object.keys(data).length > 0 ? data : null;
};

/**
 * 按 AgentRun 中保存的 rollbackPayload 执行有限回滚（单用户 Payload 直连）。
 */
export const executeRollbackFromPayload = async (
  rollbackPayload: unknown,
  options: RollbackExecutionOptions = {},
): Promise<RollbackExecutionResult> => {
  const parsed = parseRollbackPayload(rollbackPayload);

  if (!parsed?.target) {
    throw new RollbackExecutionError(
      "rollbackPayload 缺少可执行的 target。",
      "zero_effect",
    );
  }

  if (parsed.strategy !== "delete_created_checklist_and_restore_plan_links" && parsed.strategy !== "restore_schedule_completion" && !parsed.target.collection) {
    throw new RollbackExecutionError(
      "rollbackPayload 缺少可执行的 target.collection。",
      "zero_effect",
    );
  }

  const payload = options.payload ?? (await getPayloadClient());
  const shouldPersistAudit = options.persistAudit !== false;
  const recordAudit = options.recordAudit ?? recordAgentRollbackExecuted;
  const userId = options.userId;
  const {
    agentRunId,
    checklistId,
    collection,
    documentId,
    documentIds,
    expectedAddedLink,
    planId,
    planReviewId,
    suggestionIds,
    timelineEventId,
    itemId,
  } = parsed.target;

  if (parsed.strategy === "delete_created_checklist_and_restore_plan_links") {
    if (typeof checklistId !== "number" || typeof planId !== "number") {
      throw new Error("delete_created_checklist_and_restore_plan_links 需要 checklistId 和 planId。");
    }

    try {
      await payload.delete({
        collection: "checklists",
        id: checklistId,
        overrideAccess: true,
      });
    } catch (error) {
      if (!isDocumentNotFoundError(error)) {
        throw error;
      }
    }

    const plan = await payload.findByID({
      collection: "plans",
      depth: 0,
      id: planId,
      overrideAccess: true,
    });

    if (!plan || typeof (plan as { id?: unknown }).id !== "number") {
      throw new Error(`计划 #${planId} 不存在，清单已尝试删除；Plan linkedContent 需要人工确认。`);
    }

    const currentLinkedContent = normalizeLinkedContentForRollback((plan as { linkedContent?: unknown }).linkedContent);
    const expectedId = expectedChecklistLinkId(expectedAddedLink, checklistId);
    const nextLinkedContent = currentLinkedContent.filter((item) => {
      const relationId = getLinkedContentRelationId(item);

      return !(item.relationTo === "checklists" && relationId === expectedId);
    });
    const affectedDocuments = [affectedDocument("checklists", checklistId, "delete")];

    if (nextLinkedContent.length !== currentLinkedContent.length) {
      await payload.update({
        collection: "plans",
        data: {
          linkedContent: nextLinkedContent,
        },
        depth: 0,
        id: planId,
        overrideAccess: true,
      });
      affectedDocuments.push(affectedDocument("plans", planId, "update"));
    }

    const result = buildRollbackResult({
      affectedDocuments,
      collection: "checklists",
      documentId: checklistId,
      strategy: parsed.strategy,
    });
    const auditWarning = shouldPersistAudit ? await persistRollbackAudit(rollbackPayload, result, recordAudit, userId) : undefined;

    return auditWarning ? { ...result, auditWarning } : result;
  }

  if (parsed.strategy === "restore_schedule_completion") {
    if (!isTrustedUserId(userId)) {
      throw new RollbackExecutionError(
        "The related resource is not available to this operation.",
        "zero_effect",
      );
    }

    const transactionPayload = options.payload
      ? payload as RollbackPayloadClient
      : createTransactionalRollbackPayload({
          payload: payload as unknown as Payload,
        });
    const affectedDocuments = await executeTransactionalScheduleCompletionRollback({
      parsed,
      payload: transactionPayload,
      userId,
    });
    const scheduleItemId = itemId ?? documentId;
    if (!isTrustedUserId(scheduleItemId)) {
      throw new RollbackExecutionError(
        "Schedule completion rollback target could not be verified after execution.",
        "indeterminate",
      );
    }
    const result = buildRollbackResult({
      affectedDocuments,
      collection: "schedule-items",
      documentId: scheduleItemId,
      strategy: parsed.strategy,
    });
    const auditWarning = shouldPersistAudit
      ? await persistRollbackAudit(rollbackPayload, result, recordAudit, userId)
      : undefined;

    return auditWarning ? { ...result, auditWarning } : result;
  }

  if (!collection) {
    throw new Error("rollbackPayload 缺少可执行的 target.collection。");
  }

  if (parsed.strategy === "delete_created_weekly_review_artifacts") {
    if (typeof planReviewId !== "number") {
      throw new Error("delete_created_weekly_review_artifacts 需要 planReviewId。");
    }

    const affectedDocuments: RollbackAffectedDocument[] = [];

    await payload.delete({
      collection: "plan-reviews",
      id: planReviewId,
      overrideAccess: true,
    });
    affectedDocuments.push(affectedDocument("plan-reviews", planReviewId, "delete"));

    if (typeof agentRunId === "number") {
      await payload.delete({
        collection: "agent-runs",
        id: agentRunId,
        overrideAccess: true,
      });
      affectedDocuments.push(affectedDocument("agent-runs", agentRunId, "delete"));
    }

    for (const suggestionId of suggestionIds ?? []) {
      // 建议是幂等 upsert 的，回滚时归档（dismissed）而非物理删除，避免误删历史建议。
      await payload.update({
        collection: "agent-suggestions",
        data: { dismissedAt: new Date().toISOString(), status: "dismissed" },
        id: suggestionId,
        overrideAccess: true,
      });
      affectedDocuments.push(affectedDocument("agent-suggestions", suggestionId, "update"));
    }

    const result = buildRollbackResult({
      affectedDocuments,
      collection: "plan-reviews",
      documentId: planReviewId,
      strategy: parsed.strategy,
    });
    const auditWarning = shouldPersistAudit ? await persistRollbackAudit(rollbackPayload, result, recordAudit, userId) : undefined;

    return auditWarning ? { ...result, auditWarning } : result;
  }

  if (parsed.strategy === "delete_created_document") {
    if (!documentId) {
      throw new Error("delete_created_document 需要 documentId；创建前回滚占位无法自动执行。");
    }

    if (collection === "plans" || collection === "schedule-items" || collection === "checklists") {
      try {
        await payload.delete({
          collection,
          id: documentId,
          overrideAccess: true,
        });
      } catch (error) {
        if (collection !== "checklists" || !isDocumentNotFoundError(error)) {
          throw error;
        }
      }

      const result = buildRollbackResult({
        affectedDocuments: [affectedDocument(collection, documentId, "delete")],
        collection,
        documentId,
        strategy: parsed.strategy,
      });
      const auditWarning = shouldPersistAudit ? await persistRollbackAudit(rollbackPayload, result, recordAudit, userId) : undefined;

      return auditWarning ? { ...result, auditWarning } : result;
    }

    throw new Error(`delete_created_document 暂不支持 collection：${collection}`);
  }

  if (parsed.strategy === "delete_created_documents") {
    const ids = documentIds ?? [];

    if (ids.length === 0) {
      throw new Error("delete_created_documents 需要至少一个 documentIds。");
    }

    if (collection === "plans" || collection === "schedule-items") {
      /* Clean up Plan.linkedContent before deleting schedule-items */
      if (collection === "schedule-items") {
        const cleanup = (rollbackPayload as { planCleanup?: Array<{ planId: number; scheduleItemIds: number[] }> }).planCleanup;
        if (cleanup && cleanup.length > 0) {
          for (const { planId, scheduleItemIds } of cleanup) {
            const plan = await (payload as unknown as {
              findByID: (args: { collection: string; id: number; overrideAccess: boolean; depth: number }) => Promise<{ linkedContent?: unknown } | null>;
            }).findByID({
              collection: "plans",
              id: planId,
              overrideAccess: true,
              depth: 0,
            });
            if (!plan) continue;
            const current = plan.linkedContent;
            const cleaned = scheduleItemIds.reduce(
              (linkedContent, scheduleItemId) => removePlanLink(linkedContent, {
                relationTo: "schedule-items",
                value: scheduleItemId,
              }),
              current,
            );
            if (JSON.stringify(cleaned) !== JSON.stringify(current)) {
              await (payload as unknown as {
                update: (args: { collection: string; data: Record<string, unknown>; id: number; overrideAccess: boolean; depth: number }) => Promise<unknown>;
              }).update({
                collection: "plans",
                data: { linkedContent: cleaned },
                id: planId,
                overrideAccess: true,
                depth: 0,
              });
            }
          }
        }
      }

      for (const id of ids) {
        await payload.delete({
          collection,
          id,
          overrideAccess: true,
        });
      }

      const result = buildRollbackResult({
        affectedDocuments: ids.map((id) => affectedDocument(collection, id, "delete")),
        collection,
        documentId: ids[0]!,
        documentIds: ids,
        strategy: parsed.strategy,
      });
      const auditWarning = shouldPersistAudit ? await persistRollbackAudit(rollbackPayload, result, recordAudit, userId) : undefined;

      return auditWarning ? { ...result, auditWarning } : result;
    }

    throw new Error(`delete_created_documents 暂不支持 collection：${collection}`);
  }

  if (parsed.strategy === "delete_created_timeline_event") {
    if (!documentId) {
      throw new Error("delete_created_timeline_event 需要 documentId。");
    }

    if (collection !== "timeline-events") {
      throw new Error(`delete_created_timeline_event 期望 timeline-events，收到：${collection}`);
    }

    const affectedDocuments: RollbackAffectedDocument[] = [];
    if (typeof planId === "number") {
      if (!isTrustedUserId(userId)) {
        throw new RollbackExecutionError(
          "The related resource is not available to this operation.",
          "zero_effect",
        );
      }
      if (
        typeof timelineEventId !== "number" ||
        timelineEventId !== documentId
      ) {
        throw new RollbackExecutionError(
          "Timeline rollback target does not match its Plan link.",
          "zero_effect",
        );
      }

      const trustedPayload = bindRollbackPayloadToUser(
        payload as RollbackPayloadClient,
        userId,
      );
      const planUnlink = await unlinkTimelineFromPlan({
        payload: trustedPayload as CoreLinkagePayload,
        planId,
        timelineEventId,
      });
      if (!planUnlink.ok) {
        throw new RollbackExecutionError(
          planUnlink.safeMessage,
          planUnlink.code === "compensation_failed"
            ? "indeterminate"
            : "zero_effect",
        );
      }
      if (planUnlink.changed) {
        affectedDocuments.push(affectedDocument("plans", planId, "update"));
      }
    }

    await payload.delete({
      collection: "timeline-events",
      id: documentId,
      overrideAccess: true,
    });
    affectedDocuments.push(
      affectedDocument(collection, documentId, "delete"),
    );

    const result = buildRollbackResult({
      affectedDocuments,
      collection,
      documentId,
      strategy: parsed.strategy,
    });
    const auditWarning = shouldPersistAudit ? await persistRollbackAudit(rollbackPayload, result, recordAudit, userId) : undefined;

    return auditWarning ? { ...result, auditWarning } : result;
  }

  if (parsed.strategy === "archive_created_memory") {
    if (!documentId) {
      throw new Error("archive_created_memory 需要 documentId。");
    }

    if (collection !== "agent-memories") {
      throw new Error(`archive_created_memory 期望 agent-memories，收到：${collection}`);
    }

    await payload.update({
      collection: "agent-memories",
      data: { status: "archived" },
      id: documentId,
      overrideAccess: true,
    });

    const result = buildRollbackResult({
      affectedDocuments: [affectedDocument(collection, documentId, "update")],
      collection,
      documentId,
      strategy: parsed.strategy,
    });
    const auditWarning = shouldPersistAudit ? await persistRollbackAudit(rollbackPayload, result, recordAudit, userId) : undefined;

    return auditWarning ? { ...result, auditWarning } : result;
  }

  if (parsed.strategy === "restore_modified_record") {
    if (!documentId) {
      throw new Error("restore_modified_record 需要 documentId。");
    }

    const data = pickModifiedRecordSnapshot(collection, parsed.beforeSnapshot);
    if (!data) {
      throw new Error(
        `restore_modified_record 缺少 ${collection} 的有效安全字段快照。`,
      );
    }

    await payload.update({
      collection: collection as never,
      data: data as never,
      id: documentId,
      overrideAccess: true,
    });

    const result = buildRollbackResult({
      affectedDocuments: [affectedDocument(collection, documentId, "update")],
      collection,
      documentId,
      strategy: parsed.strategy,
    });
    const auditWarning = shouldPersistAudit
      ? await persistRollbackAudit(rollbackPayload, result, recordAudit, userId)
      : undefined;

    return auditWarning ? { ...result, auditWarning } : result;
  }

  if (parsed.strategy === "restore_checklist_groups") {
    if (!documentId) {
      throw new Error("restore_checklist_groups 需要 documentId。");
    }

    if (collection !== "checklists") {
      throw new Error(`restore_checklist_groups 期望 checklists，收到：${collection}`);
    }

    const snapshot = parsed.beforeSnapshot;

    if (!snapshot || !Array.isArray((snapshot as Record<string, unknown>).groups)) {
      throw new Error("restore_checklist_groups 缺少有效的 beforeSnapshot.groups。");
    }

    await payload.update({
      collection: "checklists",
      data: { groups: (snapshot as Record<string, unknown>).groups as never },
      id: documentId,
      overrideAccess: true,
    });

    const result = buildRollbackResult({
      affectedDocuments: [affectedDocument(collection, documentId, "update")],
      collection,
      documentId,
      strategy: parsed.strategy,
    });
    const auditWarning = shouldPersistAudit ? await persistRollbackAudit(rollbackPayload, result, recordAudit, userId) : undefined;

    return auditWarning ? { ...result, auditWarning } : result;
  }

  if (parsed.strategy === "restore_checklist_groups_and_timeline") {
    if (!isTrustedUserId(userId)) {
      throw new Error("The related resource is not available to this operation.");
    }

    const trustedPayload = bindRollbackPayloadToUser(payload as RollbackPayloadClient, userId);

    if (!documentId) {
      throw new Error("restore_checklist_groups_and_timeline 需要 documentId。");
    }

    if (collection !== "checklists") {
      throw new Error(`restore_checklist_groups_and_timeline 期望 checklists，收到：${collection}`);
    }

    const snapshot = parsed.beforeSnapshot as {
      groups?: unknown;
      planLinkChanged?: unknown;
      planLinkedContent?: unknown;
      timelineEvent?: unknown;
    } | undefined;

    if (!snapshot || !Array.isArray(snapshot.groups)) {
      throw new Error("restore_checklist_groups_and_timeline 缺少有效的 beforeSnapshot.groups。");
    }

    const timelineData = pickTimelineSnapshotData(snapshot.timelineEvent);
    const affectedDocuments: RollbackAffectedDocument[] = [];

    if (snapshot.planLinkChanged === true) {
      if (typeof planId !== "number" || typeof timelineEventId !== "number") {
        throw new Error("restore_checklist_groups_and_timeline 缺少 Plan 联动回滚目标。");
      }

      const planUnlink = await unlinkTimelineFromPlan({
        payload: trustedPayload as CoreLinkagePayload,
        planId,
        timelineEventId,
      });
      if (!planUnlink.ok) {
        throw new Error(planUnlink.safeMessage);
      }
      if (planUnlink.changed) {
        affectedDocuments.push(affectedDocument("plans", planId, "update"));
      }
    }

    if (timelineData && typeof (snapshot.timelineEvent as { id?: unknown }).id === "number") {
      await trustedPayload.update({
        collection: "timeline-events",
        data: timelineData as never,
        id: (snapshot.timelineEvent as { id: number }).id,
        overrideAccess: true,
      });
      affectedDocuments.push(affectedDocument("timeline-events", (snapshot.timelineEvent as { id: number }).id, "update"));
    } else if (typeof timelineEventId === "number") {
      await trustedPayload.delete({
        collection: "timeline-events",
        id: timelineEventId,
        overrideAccess: true,
      });
      affectedDocuments.push(affectedDocument("timeline-events", timelineEventId, "delete"));
    }

    await trustedPayload.update({
      collection: "checklists",
      context: { skipChecklistTimelineSync: true },
      data: { groups: snapshot.groups as never },
      id: documentId,
      overrideAccess: true,
    });
    affectedDocuments.push(affectedDocument(collection, documentId, "update"));

    const result = buildRollbackResult({
      affectedDocuments,
      collection,
      documentId,
      strategy: parsed.strategy,
    });
    const auditWarning = shouldPersistAudit ? await persistRollbackAudit(rollbackPayload, result, recordAudit, userId) : undefined;

    return auditWarning ? { ...result, auditWarning } : result;
  }

  if (parsed.strategy === "restore_schedule_item_snapshot") {
    if (!documentId) {
      throw new Error("restore_schedule_item_snapshot 需要 documentId。");
    }

    if (collection !== "schedule-items") {
      throw new Error(`restore_schedule_item_snapshot 期望 schedule-items，收到：${collection}`);
    }

    const data = pickScheduleSnapshotData(parsed.beforeSnapshot);

    if (!data) {
      throw new Error("restore_schedule_item_snapshot 缺少有效的 beforeSnapshot。");
    }

    await payload.update({
      collection: "schedule-items",
      data: data as never,
      id: documentId,
      overrideAccess: true,
    });

    const result = buildRollbackResult({
      affectedDocuments: [affectedDocument(collection, documentId, "update")],
      collection,
      documentId,
      strategy: parsed.strategy,
    });
    const auditWarning = shouldPersistAudit ? await persistRollbackAudit(rollbackPayload, result, recordAudit, userId) : undefined;

    return auditWarning ? { ...result, auditWarning } : result;
  }

  if (parsed.strategy === "restore_schedule_item_status") {
    if (!documentId) {
      throw new Error("restore_schedule_item_status 需要 documentId。");
    }

    if (collection !== "schedule-items") {
      throw new Error(`restore_schedule_item_status 期望 schedule-items，收到：${collection}`);
    }

    const snapshot = parsed.beforeSnapshot as { status?: unknown } | undefined;

    if (!snapshot || typeof snapshot.status !== "string" || !scheduleStatusValues.has(snapshot.status)) {
      throw new Error("restore_schedule_item_status 缺少有效的 beforeSnapshot.status。");
    }
    const status = snapshot.status as "canceled" | "done" | "planned" | "skipped";

    await payload.update({
      collection: "schedule-items",
      data: { status },
      id: documentId,
      overrideAccess: true,
    });

    const result = buildRollbackResult({
      affectedDocuments: [affectedDocument(collection, documentId, "update")],
      collection,
      documentId,
      strategy: parsed.strategy,
    });
    const auditWarning = shouldPersistAudit ? await persistRollbackAudit(rollbackPayload, result, recordAudit, userId) : undefined;

    return auditWarning ? { ...result, auditWarning } : result;
  }

  if (parsed.strategy === "restore_deleted_plan") {
    if (!documentId) {
      throw new Error("restore_deleted_plan 需要 documentId。");
    }

    if (collection !== "plans") {
      throw new Error(`restore_deleted_plan 期望 plans，收到：${collection}`);
    }

    const snapshot = parsed.beforeSnapshot as Record<string, unknown> | undefined;
    if (!snapshot || typeof snapshot.title !== "string") {
      throw new Error("restore_deleted_plan 缺少有效的 beforeSnapshot（至少需要 title）。");
    }

    await (payload as RollbackPayloadClient).create({
      collection: "plans",
      data: {
        agentBrief: (snapshot.agentBrief as string) ?? null,
        description: (snapshot.description as string) ?? null,
        domain: snapshot.domain ?? null,
        dueDate: snapshot.dueDate ?? null,
        executionMode: snapshot.executionMode ?? "manual",
        phases: snapshot.phases ?? null,
        priority: snapshot.priority ?? "medium",
        progress: snapshot.progress ?? null,
        state: snapshot.state ?? "backlog",
        title: snapshot.title,
        totalEstimatedDays: snapshot.totalEstimatedDays ?? null,
        visibility: snapshot.visibility ?? "private",
        weeklyRhythm: snapshot.weeklyRhythm ?? null,
      },
      overrideAccess: true,
    });

    const result = buildRollbackResult({
      affectedDocuments: [affectedDocument(collection, documentId, "create")],
      collection,
      documentId,
      strategy: parsed.strategy,
    });
    const auditWarning = shouldPersistAudit
      ? await persistRollbackAudit(rollbackPayload, result, recordAudit, userId)
      : undefined;

    return auditWarning ? { ...result, auditWarning } : result;
  }

  if (parsed.strategy === "restore_deleted_schedule_item") {
    if (!documentId) {
      throw new Error("restore_deleted_schedule_item 需要 documentId。");
    }

    if (collection !== "schedule-items") {
      throw new Error(`restore_deleted_schedule_item 期望 schedule-items，收到：${collection}`);
    }

    const data = pickScheduleSnapshotData(parsed.beforeSnapshot);
    if (!data || typeof data.title !== "string") {
      throw new Error("restore_deleted_schedule_item 缺少有效的 beforeSnapshot（至少需要 title）。");
    }

    await payload.create({
      collection: "schedule-items",
      data: data as never,
      overrideAccess: true,
    });

    const result = buildRollbackResult({
      affectedDocuments: [affectedDocument(collection, documentId, "create")],
      collection,
      documentId,
      strategy: parsed.strategy,
    });
    const auditWarning = shouldPersistAudit
      ? await persistRollbackAudit(rollbackPayload, result, recordAudit, userId)
      : undefined;

    return auditWarning ? { ...result, auditWarning } : result;
  }

  if (parsed.strategy === "restore_deleted_checklist") {
    if (!documentId) {
      throw new Error("restore_deleted_checklist 需要 documentId。");
    }

    if (collection !== "checklists") {
      throw new Error(`restore_deleted_checklist 期望 checklists，收到：${collection}`);
    }

    const data = pickChecklistSnapshotData(parsed.beforeSnapshot);
    if (!data || typeof data.title !== "string") {
      throw new Error("restore_deleted_checklist 缺少有效的 beforeSnapshot（至少需要 title）。");
    }

    await payload.create({
      collection: "checklists",
      data: data as never,
      overrideAccess: true,
    });

    const result = buildRollbackResult({
      affectedDocuments: [affectedDocument(collection, documentId, "create")],
      collection,
      documentId,
      strategy: parsed.strategy,
    });
    const auditWarning = shouldPersistAudit
      ? await persistRollbackAudit(rollbackPayload, result, recordAudit, userId)
      : undefined;

    return auditWarning ? { ...result, auditWarning } : result;
  }

  if (parsed.strategy === "restore_deleted_timeline_event") {
    if (!documentId) {
      throw new Error("restore_deleted_timeline_event 需要 documentId。");
    }

    if (collection !== "timeline-events") {
      throw new Error(`restore_deleted_timeline_event 期望 timeline-events，收到：${collection}`);
    }

    const data = pickTimelineSnapshotData(parsed.beforeSnapshot);
    if (!data || typeof data.title !== "string") {
      throw new Error("restore_deleted_timeline_event 缺少有效的 beforeSnapshot（至少需要 title）。");
    }

    await payload.create({
      collection: "timeline-events",
      data: data as never,
      overrideAccess: true,
    });

    const result = buildRollbackResult({
      affectedDocuments: [affectedDocument(collection, documentId, "create")],
      collection,
      documentId,
      strategy: parsed.strategy,
    });
    const auditWarning = shouldPersistAudit
      ? await persistRollbackAudit(rollbackPayload, result, recordAudit, userId)
      : undefined;

    return auditWarning ? { ...result, auditWarning } : result;
  }

  throw new Error(`暂不支持的回滚策略：${parsed.strategy}`);
};
