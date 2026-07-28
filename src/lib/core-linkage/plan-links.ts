import type { Plan } from "@/payload-types";

import type { CoreLinkedCollection, PlanLinkedContent } from "./contracts";

export type { PlanLinkedContent } from "./contracts";

type PlanLinkedCollection = PlanLinkedContent[number]["relationTo"];

const planLinkedCollections = new Set<PlanLinkedCollection>([
  "checklists",
  "notes",
  "pages",
  "posts",
  "schedule-items",
  "timeline-events",
  "updates",
]);

const invalidLinkedContent = (message: string, path?: string): never => {
  throw new Error(`${message}${path ? ` Invalid ${path}.` : ""}`);
};

const relationId = (value: unknown): number | null => {
  const id = typeof value === "number"
    ? value
    : value && typeof value === "object" && !Array.isArray(value) && typeof (value as { id?: unknown }).id === "number"
      ? (value as { id: number }).id
      : null;

  return typeof id === "number" && Number.isInteger(id) && id > 0 ? id : null;
};

const normalizePlanLink = (
  value: unknown,
  path: string,
): PlanLinkedContent[number] => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return invalidLinkedContent("Plan linkedContent structure is invalid; manual recovery is required.", path);
  }

  const record = value as { relationTo?: unknown; value?: unknown };
  const id = relationId(record.value);

  if (
    typeof record.relationTo !== "string" ||
    !planLinkedCollections.has(record.relationTo as PlanLinkedCollection) ||
    id == null
  ) {
    return invalidLinkedContent("Plan linkedContent structure is invalid; manual recovery is required.", path);
  }

  return {
    relationTo: record.relationTo as PlanLinkedCollection,
    value: id,
  } as PlanLinkedContent[number];
};

const linkKey = (link: PlanLinkedContent[number]) => `${link.relationTo}:${link.value}`;

export const normalizePlanLinkedContent = (current: unknown): PlanLinkedContent => {
  if (current == null) {
    return [];
  }

  if (!Array.isArray(current)) {
    return invalidLinkedContent("Plan linkedContent structure is invalid; manual recovery is required.", "linkedContent");
  }

  return current.map((link, index) => normalizePlanLink(link, `linkedContent.${index}`));
};

const normalizeCorePlanLink = (
  link: { relationTo: CoreLinkedCollection; value: number },
): PlanLinkedContent[number] => normalizePlanLink(link, "link");

const deduplicatePlanLinks = (links: PlanLinkedContent): PlanLinkedContent => {
  const seen = new Set<string>();

  return links.filter((link) => {
    const key = linkKey(link);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

export const appendPlanLink = (
  current: unknown,
  link: { relationTo: CoreLinkedCollection; value: number },
): NonNullable<Plan["linkedContent"]> =>
  deduplicatePlanLinks([
    ...normalizePlanLinkedContent(current),
    normalizeCorePlanLink(link),
  ]);

export const removePlanLink = (
  current: unknown,
  link: { relationTo: CoreLinkedCollection; value: number },
): NonNullable<Plan["linkedContent"]> => {
  const target = linkKey(normalizeCorePlanLink(link));

  return deduplicatePlanLinks(normalizePlanLinkedContent(current).filter((item) => linkKey(item) !== target));
};
