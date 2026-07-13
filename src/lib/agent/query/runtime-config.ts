import type { QueryRuntime } from "./types";

export const resolveQueryRuntime = (value = process.env.AGENT_QUERY_RUNTIME): QueryRuntime =>
  value === "langchain" ? "langchain" : "legacy";

const boundedMs = (value: string | undefined, fallback: number, max: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), max) : fallback;
};

export const resolveQueryTimeouts = () => ({
  firstTokenMs: boundedMs(process.env.AGENT_QUERY_FIRST_TOKEN_TIMEOUT_MS, 8_000, 12_000),
  totalMs: boundedMs(process.env.AGENT_QUERY_TOTAL_TIMEOUT_MS, 30_000, 45_000),
});
