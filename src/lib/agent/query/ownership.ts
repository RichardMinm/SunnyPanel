export const QUERY_OWNERSHIP_CLASSIFICATIONS = [
  "LANGCHAIN_ENHANCED",
  "DETERMINISTIC",
  "NOT_PURE_READ",
  "RETIRED",
] as const;

export type QueryOwnershipClassification =
  (typeof QUERY_OWNERSHIP_CLASSIFICATIONS)[number];

export const ACTIVE_QUERY_OWNERSHIP = {
  capability_query: "DETERMINISTIC",
  evaluate_plan: "NOT_PURE_READ",
  query_checklist_progress: "DETERMINISTIC",
  query_memory: "DETERMINISTIC",
  query_plan: "DETERMINISTIC",
  query_plan_progress: "LANGCHAIN_ENHANCED",
  query_progress: "LANGCHAIN_ENHANCED",
  query_schedule: "DETERMINISTIC",
  query_timeline: "DETERMINISTIC",
} as const satisfies Record<string, QueryOwnershipClassification>;

export type ActiveQueryIntent = keyof typeof ACTIVE_QUERY_OWNERSHIP;

export const ACTIVE_LEGACY_QUERY_MODEL_CALLS = 0 as const;
