export type WorkspaceSnapshot = Record<string, unknown>;

export const getWorkspaceSnapshot = async (): Promise<WorkspaceSnapshot> => ({});

export const getAgentWorkspaceContextSource = async () => ({
  agentRuns: [],
  checklists: [],
  contentItems: [],
  planReviews: [],
  plans: [],
  timelineEvents: [],
});
