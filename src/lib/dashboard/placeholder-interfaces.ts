/**
 * Placeholder interfaces for Dashboard UI data that the backend
 * will provide in future iterations. Current UI uses mock/stub data.
 *
 * When backend is ready, replace these with actual API responses.
 */

/* ── Inspector context ── */

export type DashboardContextItem = {
  id: string;
  type: "plan" | "schedule" | "checklist" | "post" | "note" | "timeline_event" | "memory";
  title: string;
  href: string;
  status?: string;
  summary?: string;
};

export type DashboardContext = {
  currentPlan: DashboardContextItem | null;
  todaySchedule: DashboardContextItem[];
  relatedChecklists: DashboardContextItem[];
  relatedPosts: DashboardContextItem[];
  relatedMemories: DashboardContextItem[];
  recentExecutions: DashboardContextItem[];
};

/* ── Approval items ── */

export type DashboardApprovalItem = {
  id: string;
  operationType: "create" | "update" | "delete";
  collection: string;
  summary: string;
  riskLevel: "high" | "medium" | "low";
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  reversible: boolean;
};

/* ── Trace steps ── */

export type DashboardTraceStep = {
  id: string;
  order: number;
  label: string;
  status: "completed" | "in_progress" | "pending" | "failed";
  detail?: string;
  timestamp?: string;
};

/* ── Linked objects ── */

export type DashboardLinkedObject = {
  id: string;
  collection: "plans" | "checklists" | "schedule-items" | "posts" | "notes" | "timeline-events" | "agent-memories";
  title: string;
  href: string;
  status?: string;
};

/* ── Memory items ── */

export type DashboardMemoryItem = {
  id: string;
  category: "preference" | "learning_style" | "writing_style" | "time_habit" | "project_context";
  content: string;
};

/* ── Action-oriented metrics ── */

export type DashboardMetrics = {
  pendingConfirmations: number;
  todayScheduleCount: number;
  activePlansCount: number;
  incompleteTasksCount: number;
};

/* ── Navigation definitions ── */

export type DashboardNavSection = {
  id: string;
  label: string;
  items: DashboardNavItem[];
};

export type DashboardNavItem = {
  id: string;
  label: string;
  href: string;
  icon?: string;
  badge?: number;
  external?: boolean;
};

/* ── Stub data generators (for UI development) ── */

export const stubContext: DashboardContext = {
  currentPlan: null,
  todaySchedule: [],
  relatedChecklists: [],
  relatedPosts: [],
  relatedMemories: [],
  recentExecutions: [],
};

export const stubMetrics: DashboardMetrics = {
  pendingConfirmations: 0,
  todayScheduleCount: 0,
  activePlansCount: 0,
  incompleteTasksCount: 0,
};

export const stubLinkedObjects: DashboardLinkedObject[] = [];

export const stubMemories: DashboardMemoryItem[] = [];
