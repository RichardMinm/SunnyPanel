import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildChecklistGroupsAndTimelineRollbackPayload,
  buildChecklistGroupsRollbackPayload,
} from "../../src/lib/agent/tools/checklist-rollback";
import { buildArchiveMemoryRollbackPayload } from "../../src/lib/agent/tools/memory-tools";
import {
  buildDeleteCreatedScheduleItemsRollbackPayload,
  buildScheduleItemSnapshotRollbackPayload,
  buildScheduleItemStatusRollbackPayload,
} from "../../src/lib/agent/tools/schedule-mutate";
import type { ScheduleItemRecord } from "../../src/lib/schedule/items";

const scheduleItem: ScheduleItemRecord = {
  date: "2026-06-01",
  endTime: "10:30",
  id: 42,
  isAllDay: false,
  priority: "medium",
  relatedChecklist: null,
  relatedChecklistItemKey: null,
  relatedPlan: null,
  sourceType: "agent",
  startTime: "09:00",
  status: "planned",
  title: "原日程",
};

test("schedule plan rollback payload targets every created schedule item id", () => {
  assert.deepEqual(
    buildDeleteCreatedScheduleItemsRollbackPayload([
      { id: 11 },
      { id: 12 },
    ]),
    {
      strategy: "delete_created_documents",
      target: {
        collection: "schedule-items",
        documentIds: [11, 12],
      },
    },
  );
});

test("reschedule rollback payload captures the original schedule item snapshot", () => {
  assert.deepEqual(buildScheduleItemSnapshotRollbackPayload(scheduleItem), {
    beforeSnapshot: {
      date: "2026-06-01",
      endTime: "10:30",
      isAllDay: false,
      priority: "medium",
      relatedChecklist: null,
      relatedChecklistItemKey: null,
      relatedPlan: null,
      sourceType: "agent",
      startTime: "09:00",
      status: "planned",
      title: "原日程",
    },
    strategy: "restore_schedule_item_snapshot",
    target: {
      collection: "schedule-items",
      documentId: 42,
    },
  });
});

test("cancel schedule rollback payload restores the original status", () => {
  assert.deepEqual(buildScheduleItemStatusRollbackPayload(scheduleItem), {
    beforeSnapshot: {
      status: "planned",
    },
    strategy: "restore_schedule_item_status",
    target: {
      collection: "schedule-items",
      documentId: 42,
    },
  });
});

test("save memory rollback payload archives the created memory", () => {
  assert.deepEqual(buildArchiveMemoryRollbackPayload(7), {
    strategy: "archive_created_memory",
    target: {
      collection: "agent-memories",
      documentId: 7,
    },
  });
});

test("checklist write rollback payload captures the original groups snapshot", () => {
  const groups = [
    {
      items: [
        {
          id: "item-1",
          isCompleted: false,
          title: "旧条目",
        },
      ],
      title: "阶段一",
    },
  ];

  assert.deepEqual(buildChecklistGroupsRollbackPayload(101, groups), {
    beforeSnapshot: {
      groups,
    },
    strategy: "restore_checklist_groups",
    target: {
      collection: "checklists",
      documentId: 101,
    },
  });
});

test("checklist timeline rollback payload records whether the timeline event was newly created", () => {
  const groups = [{ items: [], title: "阶段一" }];

  assert.deepEqual(buildChecklistGroupsAndTimelineRollbackPayload(101, groups, null, 501), {
    beforeSnapshot: {
      groups,
      timelineEvent: null,
    },
    strategy: "restore_checklist_groups_and_timeline",
    target: {
      collection: "checklists",
      documentId: 101,
      timelineEventId: 501,
    },
  });
});

test("checklist timeline rollback payload snapshots an existing timeline event", () => {
  const groups = [{ items: [], title: "阶段一" }];

  assert.deepEqual(
    buildChecklistGroupsAndTimelineRollbackPayload(
      101,
      groups,
      {
        description: "旧说明",
        eventDate: "2026-06-01T00:00:00.000Z",
        id: 501,
        isFeatured: true,
        relatedChecklist: 101,
        relatedTaskKey: "item-1",
        sortOrder: 3,
        status: "published",
        title: "旧时间线",
        type: "project",
        visibility: "private",
      },
      501,
    ),
    {
      beforeSnapshot: {
        groups,
        timelineEvent: {
          description: "旧说明",
          eventDate: "2026-06-01T00:00:00.000Z",
          id: 501,
          isFeatured: true,
          relatedChecklist: 101,
          relatedTaskKey: "item-1",
          sortOrder: 3,
          status: "published",
          title: "旧时间线",
          type: "project",
          visibility: "private",
        },
      },
      strategy: "restore_checklist_groups_and_timeline",
      target: {
        collection: "checklists",
        documentId: 101,
        timelineEventId: 501,
      },
    },
  );
});
