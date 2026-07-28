import type { Plan } from "@/payload-types";

export type CoreLinkedCollection =
  | "checklists"
  | "schedule-items"
  | "timeline-events";

export type AffectedDocumentSummary = {
  collection: CoreLinkedCollection | "plans";
  documentId: number;
  operation: "create" | "delete" | "update";
};

export type PlanLinkedContent = NonNullable<Plan["linkedContent"]>;
