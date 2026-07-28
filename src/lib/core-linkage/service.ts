import type { CoreLinkedCollection, PlanLinkedContent } from "./contracts";
import {
  appendPlanLink,
  normalizePlanLinkedContent,
  removePlanLink,
} from "./plan-links";

if (typeof window !== "undefined") {
  throw new Error("The core linkage service is server-only.");
}

type CoreLinkageCollection = CoreLinkedCollection | "plans";

type CoreLinkageDocument = {
  id: number;
  linkedContent?: unknown;
  planId?: unknown;
};

type CoreLinkageFindByIDArgs = {
  collection: CoreLinkageCollection;
  depth: 0;
  id: number;
  overrideAccess: false;
};

type CoreLinkageUpdateArgs = {
  collection: "plans";
  data: { linkedContent: PlanLinkedContent };
  depth: 0;
  id: number;
  overrideAccess: false;
};

export type CoreLinkageActor = {
  isAdministrator: true;
  userId: number;
};

export type CoreLinkagePayload = {
  findByID: (args: CoreLinkageFindByIDArgs) => Promise<CoreLinkageDocument | null>;
  update: (args: CoreLinkageUpdateArgs) => Promise<unknown>;
};

export type CoreLinkageFailureCode =
  | "invalid_reference"
  | "resource_not_found"
  | "resource_not_authorized"
  | "plan_link_invalid"
  | "plan_link_write_failed"
  | "compensation_failed";

type CoreLinkageFailure = {
  code: CoreLinkageFailureCode;
  ok: false;
  safeMessage: string;
};

type CoreLinkageSuccess = {
  changed: boolean;
  ok: true;
  planId: number | null;
};

export type CoreLinkageResult = CoreLinkageFailure | CoreLinkageSuccess;

export type CoreLinkagePlanMutationResult =
  | CoreLinkageFailure
  | (CoreLinkageSuccess & {
      afterLinkedContent: PlanLinkedContent;
      beforeLinkedContent: PlanLinkedContent;
      planId: number;
      timelineEventId: number;
    });

const failureMessages: Record<CoreLinkageFailureCode, string> = {
  compensation_failed: "The Plan link outcome could not be reconciled safely.",
  invalid_reference: "The related resource reference is invalid.",
  plan_link_invalid: "The Plan link state is invalid.",
  plan_link_write_failed: "The Plan link could not be updated.",
  resource_not_authorized: "The related resource is not available to this operation.",
  resource_not_found: "The related resource was not found.",
};

const fail = (code: CoreLinkageFailureCode): CoreLinkageFailure => ({
  code,
  ok: false,
  safeMessage: failureMessages[code],
});

const isPersistedId = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

const isAuthorizationError = (error: unknown) => {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as { code?: unknown; status?: unknown; statusCode?: unknown };
  const status = record.status ?? record.statusCode;

  return status === 401 || status === 403 || record.code === "FORBIDDEN" || record.code === "UNAUTHORIZED";
};

const readExact = async (
  payload: CoreLinkagePayload,
  collection: CoreLinkageCollection,
  id: number,
): Promise<CoreLinkageDocument | CoreLinkageFailure> => {
  try {
    const document = await payload.findByID({
      collection,
      depth: 0,
      id,
      overrideAccess: false,
    });

    if (!document || document.id !== id) {
      return fail("resource_not_found");
    }

    return document;
  } catch (error) {
    return fail(isAuthorizationError(error) ? "resource_not_authorized" : "resource_not_found");
  }
};

const isFailure = (value: unknown): value is CoreLinkageFailure =>
  value !== null
  && typeof value === "object"
  && "ok" in value
  && (value as { ok?: unknown }).ok === false;

const sameLinks = (left: PlanLinkedContent, right: PlanLinkedContent) =>
  JSON.stringify(left) === JSON.stringify(right);

const readPlanAndTimeline = async (input: {
  payload: CoreLinkagePayload;
  planId: number;
  timelineEventId: number;
}): Promise<
  | CoreLinkageFailure
  | {
      plan: CoreLinkageDocument;
    }
> => {
  const plan = await readExact(input.payload, "plans", input.planId);
  if (isFailure(plan)) {
    return plan;
  }

  const timelineEvent = await readExact(input.payload, "timeline-events", input.timelineEventId);
  if (isFailure(timelineEvent)) {
    return timelineEvent;
  }

  return { plan };
};

const updatePlanLinks = async (input: {
  afterLinkedContent: PlanLinkedContent;
  beforeLinkedContent: PlanLinkedContent;
  payload: CoreLinkagePayload;
  planId: number;
}): Promise<CoreLinkageFailure | null> => {
  try {
    await input.payload.update({
      collection: "plans",
      data: { linkedContent: input.afterLinkedContent },
      depth: 0,
      id: input.planId,
      overrideAccess: false,
    });
    return null;
  } catch (error) {
    if (isAuthorizationError(error)) {
      return fail("resource_not_authorized");
    }

    const currentPlan = await readExact(input.payload, "plans", input.planId);
    if (isFailure(currentPlan)) {
      return currentPlan.code === "resource_not_authorized"
        ? currentPlan
        : fail("compensation_failed");
    }

    let currentLinkedContent: PlanLinkedContent;
    try {
      currentLinkedContent = normalizePlanLinkedContent(currentPlan.linkedContent);
    } catch {
      return fail("compensation_failed");
    }

    if (sameLinks(currentLinkedContent, input.beforeLinkedContent)) {
      return fail("plan_link_write_failed");
    }

    if (!sameLinks(currentLinkedContent, input.afterLinkedContent)) {
      return fail("compensation_failed");
    }

    return null;
  }
};

export async function resolveChecklistPlanId(input: {
  checklistId: number;
  payload: CoreLinkagePayload;
}): Promise<CoreLinkageResult> {
  if (!isPersistedId(input.checklistId)) {
    return fail("invalid_reference");
  }

  const checklist = await readExact(input.payload, "checklists", input.checklistId);
  if (isFailure(checklist)) {
    return checklist;
  }

  if (checklist.planId == null) {
    return { changed: false, ok: true, planId: null };
  }

  if (!isPersistedId(checklist.planId)) {
    return fail("invalid_reference");
  }

  const plan = await readExact(input.payload, "plans", checklist.planId);
  if (isFailure(plan)) {
    return plan;
  }

  return { changed: false, ok: true, planId: checklist.planId };
}

const mutateTimelinePlanLink = async (input: {
  payload: CoreLinkagePayload;
  planId: number;
  timelineEventId: number;
  operation: "append" | "remove";
}): Promise<CoreLinkagePlanMutationResult> => {
  if (!isPersistedId(input.planId) || !isPersistedId(input.timelineEventId)) {
    return fail("invalid_reference");
  }

  const resources = await readPlanAndTimeline(input);
  if (isFailure(resources)) {
    return resources;
  }

  let beforeLinkedContent: PlanLinkedContent;
  let afterLinkedContent: PlanLinkedContent;

  try {
    beforeLinkedContent = normalizePlanLinkedContent(resources.plan.linkedContent);
    const link = { relationTo: "timeline-events" as const, value: input.timelineEventId };
    afterLinkedContent = input.operation === "append"
      ? appendPlanLink(beforeLinkedContent, link)
      : removePlanLink(beforeLinkedContent, link);
  } catch {
    return fail("plan_link_invalid");
  }

  const changed = !sameLinks(beforeLinkedContent, afterLinkedContent);
  if (changed) {
    const writeFailure = await updatePlanLinks({
      afterLinkedContent,
      beforeLinkedContent,
      payload: input.payload,
      planId: input.planId,
    });
    if (writeFailure) {
      return writeFailure;
    }
  }

  return {
    afterLinkedContent,
    beforeLinkedContent,
    changed,
    ok: true,
    planId: input.planId,
    timelineEventId: input.timelineEventId,
  };
};

export async function linkTimelineToPlan(input: {
  payload: CoreLinkagePayload;
  planId: number;
  timelineEventId: number;
}): Promise<CoreLinkagePlanMutationResult> {
  return mutateTimelinePlanLink({ ...input, operation: "append" });
}

export async function unlinkTimelineFromPlan(input: {
  payload: CoreLinkagePayload;
  planId: number;
  timelineEventId: number;
}): Promise<CoreLinkagePlanMutationResult> {
  return mutateTimelinePlanLink({ ...input, operation: "remove" });
}
