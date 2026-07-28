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

export type LinkedObjectSummary =
  | {
      id: number;
      title: string;
      type: "plan";
    }
  | {
      id: number;
      title: string;
      type: "checklist";
    }
  | {
      date: string;
      id: number;
      status: string | null;
      title: string;
      type: "schedule";
    }
  | {
      date: string;
      id: number;
      status: string | null;
      title: string;
      type: "timeline";
    };

export type PlanSummary = {
  agentState?: string | null;
  checklists: Array<{
    completedItems: number;
    id: number;
    title: string;
    totalItems: number;
  }>;
  createdAt?: string | null;
  id: number;
  linkedObjects: LinkedObjectSummary[];
  progress?: number | null;
  scheduleItems: Array<{
    endsAt?: string | null;
    id: number;
    startsAt?: string | null;
    status?: string | null;
    title: string;
  }>;
  state?: string | null;
  status?: string | null;
  title: string;
  updatedAt?: string | null;
};

export type ChecklistViewSummary = {
  completedItems: number;
  id: number;
  items: Array<{
    completed: boolean;
    key: string;
    label: string;
  }>;
  linkedObjects: LinkedObjectSummary[];
  relatedPlan: { id: number; title: string } | null;
  status: string;
  title: string;
  totalItems: number;
};

export type ScheduleViewSummary = {
  category: string | null;
  conflictNote: string | null;
  date: string;
  description: string | null;
  endTime: string | null;
  id: number;
  linkedObjects: LinkedObjectSummary[];
  planId: number | null;
  priority: string;
  relatedChecklist: { id: number; title: string } | null;
  relatedChecklistItemKey: string | null;
  relatedPlan: { id: number; title: string } | null;
  sourceType: string;
  startTime: string | null;
  status: string | null;
  title: string;
};

export type TimelineViewSummary = {
  date: string;
  description: string | null;
  id: number;
  linkedObjects: LinkedObjectSummary[];
  sourceType: string | null;
  title: string;
  type: string;
};
