import "server-only";

export type DashboardSearchParams = {
  collection?: string | string[];
  id?: string | string[];
  mode?: string | string[];
  threadId?: string | string[];
  week?: string | string[];
};

export type LoadedDashboardData = {
  initialThreadId?: number;
};

export const parseDashboardThreadId = (value?: string | string[]) => {
  const rawValue = Array.isArray(value) ? value[0] : value;

  if (!rawValue) {
    return undefined;
  }

  const parsed = Number(rawValue);

  return Number.isFinite(parsed) ? parsed : undefined;
};

/**
 * Dashboard server-component data loader — critical path only.
 *
 * Phase P2: Only parses the threadId from URL search params.
 * The workspace snapshot, suggestion generation, and pending suggestions
 * stay out of the HTML response critical path:
 *
 *   - Workspace snapshot → triggered on-demand by agent pipeline
 *   - Suggestion generation → triggered by the business event that changed content
 *   - Pending suggestions → GET /api/agent/suggestions (client fetches on mount)
 *
 * This keeps the root document response fast (≤ 500ms target).
 */
export const loadDashboardData = async (
  searchParams: DashboardSearchParams,
  _redirectPath?: string,
): Promise<LoadedDashboardData> => {
  const initialThreadId = parseDashboardThreadId(searchParams.threadId);

  return { initialThreadId };
};
