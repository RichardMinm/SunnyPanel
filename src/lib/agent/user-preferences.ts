export type AgentAutonomyLevel = 0 | 1 | 2 | 3;

export type UserPreferences = {
  autoApproveIntents: Set<string>;
  autoApproveLowRisk: boolean;
  autonomyLevel: AgentAutonomyLevel;
  deniedIntents: Set<string>;
  maxConsecutiveAutoApprovals: number;
};

const defaults: UserPreferences = {
  autoApproveIntents: new Set(),
  deniedIntents: new Set(),
  autoApproveLowRisk: true,
  autonomyLevel: 2,
  maxConsecutiveAutoApprovals: 8,
};

type PreferenceMemoryDoc = {
  content?: null | string;
  title?: null | string;
};

const clonePreferences = (preferences: UserPreferences): UserPreferences => ({
  autoApproveIntents: new Set(preferences.autoApproveIntents),
  autoApproveLowRisk: preferences.autoApproveLowRisk,
  autonomyLevel: preferences.autonomyLevel,
  deniedIntents: new Set(preferences.deniedIntents),
  maxConsecutiveAutoApprovals: preferences.maxConsecutiveAutoApprovals,
});

export const parseUserPreferencesFromMemoryDocs = (_docs: PreferenceMemoryDoc[]): UserPreferences =>
  // Agent memories are model-writable content and therefore cannot be an
  // authorization-policy source. Keep this compatibility entry point fail-closed.
  clonePreferences(defaults);

export const getUserPreferences = (_userId: number): Promise<UserPreferences> =>
  Promise.resolve(clonePreferences(defaults));
