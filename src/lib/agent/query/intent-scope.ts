import type { AgentIntent } from "../schemas";
import { resolveQueryRuntime } from "./runtime-config";

export const classifyQueryEligibility = (intent: AgentIntent, runtime?: string):
  | { eligible: false; runtime: "legacy"; reason: string }
  | { eligible: true; runtime: "langchain"; intent: "query_progress" | "query_plan_progress" } => {
  if (resolveQueryRuntime(runtime) !== "langchain") return { eligible: false, runtime: "legacy", reason: "runtime_disabled" };
  if (intent.intent === "query_progress") {
    const args = intent.args as { checklistTitle?: unknown; scope?: unknown };
    return !args.checklistTitle && [undefined, "all", "plans", "checklists"].includes(args.scope as never)
      ? { eligible: true, runtime: "langchain", intent: "query_progress" }
      : { eligible: false, runtime: "legacy", reason: "unsupported_query_variant" };
  }
  if (intent.intent === "query_plan_progress") {
    const args = intent.args as { planId?: unknown; planTitle?: unknown };
    return typeof args.planId === "number" && Number.isInteger(args.planId) && args.planId > 0 && !args.planTitle
      ? { eligible: true, runtime: "langchain", intent: "query_plan_progress" }
      : { eligible: false, runtime: "legacy", reason: "unsupported_query_variant" };
  }
  return { eligible: false, runtime: "legacy", reason: "intent_not_allowlisted" };
};
