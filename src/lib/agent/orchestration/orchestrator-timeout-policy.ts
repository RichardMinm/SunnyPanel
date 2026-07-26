export const FULL_ORCHESTRATOR_TIMEOUT_POLICY = Object.freeze({
  firstAttemptTimeoutMs: 30_000,
  maxRetries: 1,
  retryTimeoutMs: 10_000,
  totalTimeoutMs: 40_000,
} as const);
