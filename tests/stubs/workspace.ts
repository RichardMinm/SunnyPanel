import type { AgentContextSource } from "../../src/lib/agent/context-builder";
import type { AgentSuggestionSnapshot } from "../../src/lib/agent/suggestions-core";

export type WorkspaceSnapshot = AgentSuggestionSnapshot;

const emptySnapshot: WorkspaceSnapshot = {
  agent: {
    recentReviews: [],
    recentRuns: [],
  },
  execution: {
    recentContentWithoutPlans: [],
    recentPrivateReady: [],
    timelineCandidates: [],
  },
  plans: {
    active: [],
    backlog: [],
    paused: [],
  },
};

export const getWorkspaceSnapshot = async (): Promise<WorkspaceSnapshot> => emptySnapshot;

export const getAgentWorkspaceContextSource = async (args?: unknown): Promise<AgentContextSource> => {
  void args;

  return {
    agentRuns: [],
    checklists: [],
    contentItems: [],
    planReviews: [],
    plans: [],
    timelineEvents: [],
  };
};
