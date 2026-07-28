import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import {
  linkTimelineToPlan,
  resolveChecklistPlanId,
  unlinkTimelineFromPlan,
  type CoreLinkagePayload,
} from "../../../src/lib/core-linkage/service";

type Link = { relationTo: string; value: number | { id: number } };
type Document = { id: number; linkedContent?: unknown; planId?: unknown; title?: string };
type FindByIDArgs = { collection: string; depth: number; id: number; overrideAccess: boolean };
type UpdateArgs = { collection: string; data: { linkedContent: unknown }; depth: number; id: number; overrideAccess: boolean };

class FakePayload {
  readonly findByIDCalls: FindByIDArgs[] = [];
  readonly updateCalls: UpdateArgs[] = [];
  readonly documents = new Map<string, Document>();
  findByIDError: Error | null = null;
  updateFailures = 0;

  put(collection: string, document: Document) {
    this.documents.set(`${collection}:${document.id}`, structuredClone(document));
  }

  async findByID(args: FindByIDArgs) {
    this.findByIDCalls.push(args);

    if (this.findByIDError) {
      throw this.findByIDError;
    }

    const document = this.documents.get(`${args.collection}:${args.id}`);
    return document ? structuredClone(document) : null;
  }

  async update(args: UpdateArgs) {
    this.updateCalls.push(structuredClone(args));

    if (this.updateFailures > 0) {
      this.updateFailures -= 1;
      throw new Error("database error: private title should never escape");
    }

    const current = this.documents.get(`${args.collection}:${args.id}`);
    if (!current) {
      throw new Error("missing document");
    }

    const next = { ...current, ...args.data };
    this.documents.set(`${args.collection}:${args.id}`, next);
    return structuredClone(next);
  }
}

let fakePayload: FakePayload;
let payload: CoreLinkagePayload;

beforeEach(() => {
  fakePayload = new FakePayload();
  payload = fakePayload as unknown as CoreLinkagePayload;
});

const expectSuccess = <T extends { ok: boolean }>(result: T): Exclude<T, { ok: false }> => {
  assert.equal(result.ok, true);
  return result as Exclude<T, { ok: false }>;
};

test("core linkage rejects non-positive or non-integer persisted IDs before reading", async () => {
  for (const checklistId of [0, -1, 1.5, Number.NaN]) {
    const result = await resolveChecklistPlanId({ checklistId, payload });
    assert.deepEqual(result, {
      code: "invalid_reference",
      ok: false,
      safeMessage: "The related resource reference is invalid.",
    });
  }

  const mutation = await linkTimelineToPlan({ payload, planId: 4, timelineEventId: 0 });
  assert.equal(mutation.ok, false);
  if (!mutation.ok) assert.equal(mutation.code, "invalid_reference");
  assert.deepEqual(fakePayload.findByIDCalls, []);
  assert.deepEqual(fakePayload.updateCalls, []);
});

test("resolveChecklistPlanId reads the exact persisted checklist and Plan IDs without a title search", async () => {
  fakePayload.put("checklists", { id: 31, planId: 11, title: "Same title as another checklist" });
  fakePayload.put("plans", { id: 11, title: "Exact persisted Plan" });

  const result = expectSuccess(await resolveChecklistPlanId({ checklistId: 31, payload }));

  assert.deepEqual(result, { changed: false, ok: true, planId: 11 });
  assert.deepEqual(fakePayload.findByIDCalls, [
    { collection: "checklists", depth: 0, id: 31, overrideAccess: false },
    { collection: "plans", depth: 0, id: 11, overrideAccess: false },
  ]);
});

test("resolveChecklistPlanId returns a safe not-found result for deleted checklist or Plan", async () => {
  const missingChecklist = await resolveChecklistPlanId({ checklistId: 31, payload });
  assert.equal(missingChecklist.ok, false);
  if (!missingChecklist.ok) assert.equal(missingChecklist.code, "resource_not_found");

  fakePayload.put("checklists", { id: 31, planId: 11 });
  const missingPlan = await resolveChecklistPlanId({ checklistId: 31, payload });
  assert.equal(missingPlan.ok, false);
  if (!missingPlan.ok) assert.equal(missingPlan.code, "resource_not_found");
});

test("core linkage converts Payload authorization exceptions into a safe typed failure", async () => {
  const unauthorized = new Error("forbidden: private project Phoenix");
  Object.assign(unauthorized, { status: 403 });
  fakePayload.findByIDError = unauthorized;

  const result = await resolveChecklistPlanId({ checklistId: 31, payload });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(result, {
      code: "resource_not_authorized",
      ok: false,
      safeMessage: "The related resource is not available to this operation.",
    });
    assert.doesNotMatch(result.safeMessage, /Phoenix|forbidden/i);
  }
});

test("linkTimelineToPlan preserves unrelated links and returns the pre-mutation snapshot", async () => {
  const before: Link[] = [
    { relationTo: "posts", value: 7 },
    { relationTo: "checklists", value: 31 },
  ];
  fakePayload.put("plans", { id: 11, linkedContent: before });
  fakePayload.put("timeline-events", { id: 41, title: "Milestone" });

  const result = expectSuccess(await linkTimelineToPlan({ payload, planId: 11, timelineEventId: 41 }));

  assert.deepEqual(result, {
    afterLinkedContent: [
      { relationTo: "posts", value: 7 },
      { relationTo: "checklists", value: 31 },
      { relationTo: "timeline-events", value: 41 },
    ],
    beforeLinkedContent: before,
    changed: true,
    ok: true,
    planId: 11,
    timelineEventId: 41,
  });
  assert.deepEqual(fakePayload.updateCalls, [{
    collection: "plans",
    data: { linkedContent: result.afterLinkedContent },
    depth: 0,
    id: 11,
    overrideAccess: false,
  }]);
});

test("linkTimelineToPlan is idempotent when the exact Timeline link already exists", async () => {
  const linkedContent: Link[] = [{ relationTo: "timeline-events", value: 41 }];
  fakePayload.put("plans", { id: 11, linkedContent });
  fakePayload.put("timeline-events", { id: 41 });

  const result = expectSuccess(await linkTimelineToPlan({ payload, planId: 11, timelineEventId: 41 }));

  assert.deepEqual(result, {
    afterLinkedContent: linkedContent,
    beforeLinkedContent: linkedContent,
    changed: false,
    ok: true,
    planId: 11,
    timelineEventId: 41,
  });
  assert.deepEqual(fakePayload.updateCalls, []);
});

test("unlinkTimelineFromPlan removes only the exact Timeline link and is idempotent", async () => {
  fakePayload.put("plans", {
    id: 11,
    linkedContent: [
      { relationTo: "posts", value: 7 },
      { relationTo: "timeline-events", value: 41 },
      { relationTo: "timeline-events", value: 42 },
    ],
  });
  fakePayload.put("timeline-events", { id: 41 });

  const removed = expectSuccess(await unlinkTimelineFromPlan({ payload, planId: 11, timelineEventId: 41 }));
  assert.deepEqual(removed.afterLinkedContent, [
    { relationTo: "posts", value: 7 },
    { relationTo: "timeline-events", value: 42 },
  ]);
  assert.equal(removed.changed, true);

  const repeated = expectSuccess(await unlinkTimelineFromPlan({ payload, planId: 11, timelineEventId: 41 }));
  assert.equal(repeated.changed, false);
  assert.equal(fakePayload.updateCalls.length, 1);
});

test("core linkage fails closed for malformed Plan links without exposing document data", async () => {
  fakePayload.put("plans", { id: 11, linkedContent: "not-an-array" });
  fakePayload.put("timeline-events", { id: 41 });

  const result = await linkTimelineToPlan({ payload, planId: 11, timelineEventId: 41 });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.deepEqual(result, {
      code: "plan_link_invalid",
      ok: false,
      safeMessage: "The Plan link state is invalid.",
    });
  }
  assert.deepEqual(fakePayload.updateCalls, []);
});

test("core linkage restores the Plan snapshot after a failed link write", async () => {
  const before: Link[] = [{ relationTo: "posts", value: 7 }];
  fakePayload.put("plans", { id: 11, linkedContent: before });
  fakePayload.put("timeline-events", { id: 41 });
  fakePayload.updateFailures = 1;

  const result = await linkTimelineToPlan({ payload, planId: 11, timelineEventId: 41 });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "plan_link_write_failed");
  assert.deepEqual(fakePayload.updateCalls.map((call) => call.data.linkedContent), [
    [
      { relationTo: "posts", value: 7 },
      { relationTo: "timeline-events", value: 41 },
    ],
    before,
  ]);
});

test("core linkage reports an explicit safe compensation failure", async () => {
  fakePayload.put("plans", { id: 11, linkedContent: [{ relationTo: "posts", value: 7 }] });
  fakePayload.put("timeline-events", { id: 41 });
  fakePayload.updateFailures = 2;

  const result = await linkTimelineToPlan({ payload, planId: 11, timelineEventId: 41 });

  assert.deepEqual(result, {
    code: "compensation_failed",
    ok: false,
    safeMessage: "The Plan link could not be restored safely.",
  });
  assert.equal(fakePayload.updateCalls.length, 2);
});
