import type { Checklist, TimelineEvent } from "@/payload-types";

import { getPayloadClient } from "@/lib/payload/client";

import {
  CHECKLIST_TIMELINE_SOURCE_TYPE,
  CHECKLIST_TIMELINE_TYPE,
} from "./checklist-timeline-semantics";
import { validateTimelineEventData } from "./write-schemas";
import {
  buildTimelineDescription,
  buildTimelineTitle,
  scoreTextMatch,
  type ChecklistGroup,
  type ChecklistItem,
} from "./tool-shared";

export const findChecklist = async (checklistTitle: string) => {
  const payload = await getPayloadClient();
  const checklists = await payload.find({
    collection: "checklists",
    depth: 0,
    limit: 100,
    overrideAccess: true,
    sort: "-updatedAt",
  });
  const scoredMatches = checklists.docs
    .map((doc) => ({
      doc,
      score: scoreTextMatch(doc.title, checklistTitle),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scoredMatches.length === 0) {
    return {
      checklist: null,
      question: `我没找到「${checklistTitle}」这份清单。你可以告诉我更准确的清单名。`,
    };
  }

  if (scoredMatches.length > 1 && scoredMatches[0]?.score === scoredMatches[1]?.score) {
    return {
      checklist: null,
      question: `我找到了多份接近「${checklistTitle}」的清单：${scoredMatches
        .slice(0, 3)
        .map((item) => item.doc.title)
        .join("、")}。你想操作哪一份？`,
    };
  }

  return {
    checklist: scoredMatches[0]?.doc ?? null,
    question: null,
  };
};

export const resolveChecklistItem = async ({
  checklistTitle,
  groupTitle,
  itemTitle,
}: {
  checklistTitle: string;
  groupTitle?: null | string;
  itemTitle: string;
}) => {
  const checklistResult = await findChecklist(checklistTitle);

  if (!checklistResult.checklist) {
    return {
      question: checklistResult.question ?? "我还没找到对应的清单。",
      resolved: null,
    };
  }

  const checklist = checklistResult.checklist;
  const candidates = (checklist.groups ?? []).flatMap((group, groupIndex) =>
    (group.items ?? []).map((item, itemIndex) => {
      const itemScore = scoreTextMatch(item.title, itemTitle);
      const groupScore = groupTitle ? scoreTextMatch(group.title, groupTitle) : 0;

      return {
        group,
        groupScore,
        groupIndex,
        item,
        itemScore,
        itemIndex,
        score: groupTitle ? itemScore + groupScore : itemScore,
      };
    }),
  );
  const filtered = candidates
    .filter((candidate) => candidate.itemScore > 0 && (!groupTitle || candidate.groupScore > 0))
    .sort((a, b) => b.score - a.score);

  if (filtered.length === 0) {
    const groupHint = groupTitle ? `${groupTitle} / ` : "";

    return {
      question: `我在「${checklist.title}」里没找到「${groupHint}${itemTitle}」这个条目。你可以告诉我更准确的分组名或条目名。`,
      resolved: null,
    };
  }

  if (filtered.length > 1 && filtered[0]?.score === filtered[1]?.score) {
    return {
      question: `我在「${checklist.title}」里找到了多个接近「${itemTitle}」的条目：${filtered
        .slice(0, 3)
        .map((candidate) => `${candidate.group.title} / ${candidate.item.title}`)
        .join("、")}。你想操作哪一个？`,
      resolved: null,
    };
  }

  return {
    question: null,
    resolved: {
      checklist,
      group: filtered[0]!.group,
      groupIndex: filtered[0]!.groupIndex,
      item: filtered[0]!.item,
      itemIndex: filtered[0]!.itemIndex,
    },
  };
};

export const resolveChecklistGroupForAppend = async ({
  checklistTitle,
  groupTitle,
}: {
  checklistTitle: string;
  groupTitle?: null | string;
}) => {
  const checklistResult = await findChecklist(checklistTitle);

  if (!checklistResult.checklist) {
    return {
      question: checklistResult.question ?? "我还没找到对应的清单。",
      resolved: null,
    };
  }

  const checklist = checklistResult.checklist;
  const groups = checklist.groups ?? [];

  if (groups.length === 0) {
    return {
      checklist,
      question: `「${checklist.title}」里还没有分组。请先告诉我要把条目放在哪个分组里。`,
      resolved: null,
    };
  }

  if (!groupTitle) {
    if (groups.length === 1) {
      return {
        question: null,
        resolved: {
          checklist,
          group: groups[0]!,
          groupIndex: 0,
        },
      };
    }

    return {
      question: `「${checklist.title}」有多个分组：${groups
        .slice(0, 5)
        .map((group) => group.title)
        .join("、")}。这条计划项要放到哪个分组？`,
      resolved: null,
    };
  }

  const scoredMatches = groups
    .map((group, groupIndex) => ({
      group,
      groupIndex,
      score: scoreTextMatch(group.title, groupTitle),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scoredMatches.length === 0) {
    return {
      checklist,
      question: `我在「${checklist.title}」里没找到「${groupTitle}」这个分组。你可以告诉我更准确的分组名。`,
      resolved: null,
    };
  }

  if (scoredMatches.length > 1 && scoredMatches[0]?.score === scoredMatches[1]?.score) {
    return {
      question: `我在「${checklist.title}」里找到了多个接近「${groupTitle}」的分组：${scoredMatches
        .slice(0, 3)
        .map((item) => item.group.title)
        .join("、")}。你想放到哪一个？`,
      resolved: null,
    };
  }

  return {
    question: null,
    resolved: {
      checklist,
      group: scoredMatches[0]!.group,
      groupIndex: scoredMatches[0]!.groupIndex,
    },
  };
};

export const cloneChecklistGroups = (groups: Checklist["groups"]) =>
  (groups ?? []).map((group) => ({
    ...group,
    items: (group.items ?? []).map((item) => ({
      ...item,
    })),
  }));

export const findChecklistTimelineEvent = async ({
  checklist,
  item,
}: {
  checklist: Pick<Checklist, "id">;
  item: Pick<ChecklistItem, "id">;
}) => {
  if (!item.id) {
    return null;
  }

  const payload = await getPayloadClient();
  const existingEvent = await payload.find({
    collection: "timeline-events",
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    where: {
      and: [
        {
          relatedChecklist: {
            equals: checklist.id,
          },
        },
        {
          relatedTaskKey: {
            equals: item.id,
          },
        },
      ],
    },
  });

  return (existingEvent.docs[0] as TimelineEvent | undefined) ?? null;
};

export const upsertChecklistTimelineEvent = async ({
  checklist,
  group,
  item,
}: {
  checklist: Checklist;
  group: ChecklistGroup;
  item: ChecklistItem;
}) => {
  if (!item.id || !item.isCompleted) {
    return null;
  }

  const payload = await getPayloadClient();
  const existingEvent = await findChecklistTimelineEvent({
    checklist,
    item,
  });
  const data = validateTimelineEventData({
    description: buildTimelineDescription(checklist.title, group.title, item),
    eventDate: item.completedAt || new Date().toISOString(),
    isFeatured: false,
    relatedChecklist: checklist.id,
    relatedTaskKey: item.id,
    sortOrder: 0,
    sourceType: CHECKLIST_TIMELINE_SOURCE_TYPE,
    status: checklist.status,
    title: buildTimelineTitle(checklist.title, group.title, item.title),
    type: CHECKLIST_TIMELINE_TYPE,
    visibility: checklist.visibility,
  });

  if (existingEvent) {
    return (await payload.update({
      collection: "timeline-events",
      data,
      id: existingEvent.id,
      overrideAccess: true,
    })) as TimelineEvent;
  }

  return (await payload.create({
    collection: "timeline-events",
    data,
    overrideAccess: true,
  })) as TimelineEvent;
};
