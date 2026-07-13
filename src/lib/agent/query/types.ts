import type { QueryPlanProgressArgs, QueryProgressArgs } from "../schemas";
import type { AgentProgressSnapshot } from "../progress";

export const LANGCHAIN_QUERY_INTENTS = ["query_progress", "query_plan_progress"] as const;
export type QueryRuntime = "legacy" | "langchain";

export type AggregateProgressFacts = {
  args: QueryProgressArgs;
  kind: "aggregate_progress";
  snapshot: AgentProgressSnapshot;
};

export type PlanProgressFacts = {
  dueDate: null | string;
  executionMode: null | string;
  kind: "plan_progress";
  phases: Array<{
    estimatedDays: number;
    goal: string;
    milestoneCount: number;
    taskCount: number;
    title: string;
  }>;
  planId: number;
  priority: string;
  state: string;
  storedProgressPercent: null | number;
  title: string;
  totalEstimatedDays: null | number;
  weeklyRhythm: null | string;
};

export type QueryFacts = AggregateProgressFacts | PlanProgressFacts;
export type SafeQueryErrorCode = "empty_stream" | "first_token_timeout" | "numeric_output" | "provider_error" | "tool_call" | "total_timeout";

export type QueryStreamTerminalState =
  | { status: "complete"; persist: true; answer: string; modelCalls: 1 }
  | { status: "unavailable"; persist: false; errorCode: SafeQueryErrorCode; modelCalls: 0 | 1 }
  | { status: "partial"; persist: false; partialOutputEmitted: true; errorCode: SafeQueryErrorCode; modelCalls: 1 };

export type QueryPlanArgs = QueryPlanProgressArgs;
