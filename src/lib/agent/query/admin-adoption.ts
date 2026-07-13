import type { AgentIntent } from "../schemas";
import type { QueryAdoption, QueryRuntime } from "./types";

export type AdminQueryAdoptionReason =
  | "runtime_legacy"
  | "adoption_disabled"
  | "actor_not_admin"
  | "intent_not_eligible"
  | "argument_shape_not_eligible"
  | "canonical_block_oversized"
  | "adopted_admin_query";

export type AdminQueryAdoptionDecision =
  | { adopted: false; reason: Exclude<AdminQueryAdoptionReason, "adopted_admin_query"> }
  | { adopted: true; reason: "adopted_admin_query" };

export type DecideAdminQueryAdoptionInput = {
  actor: { isAdmin: boolean };
  adoption: QueryAdoption;
  intent: AgentIntent;
  runtime: QueryRuntime;
};

const hasOnlyKeys = (value: Record<string, unknown>, allowed: readonly string[]) =>
  Object.keys(value).every((key) => allowed.includes(key));

const hasEligibleAggregateArgs = (args: Record<string, unknown>) => {
  if (!hasOnlyKeys(args, ["checklistTitle", "scope"])) return false;
  if (args.checklistTitle !== undefined && args.checklistTitle !== null) return false;
  return args.scope === undefined || args.scope === "all" || args.scope === "plans" || args.scope === "checklists";
};

const hasEligiblePlanArgs = (args: Record<string, unknown>) =>
  hasOnlyKeys(args, ["planId"])
  && typeof args.planId === "number"
  && Number.isInteger(args.planId)
  && args.planId > 0;

export const decideAdminQueryAdoption = (input: DecideAdminQueryAdoptionInput): AdminQueryAdoptionDecision => {
  if (input.runtime !== "langchain") return { adopted: false, reason: "runtime_legacy" };
  if (input.adoption !== "admin") return { adopted: false, reason: "adoption_disabled" };
  if (!input.actor.isAdmin) return { adopted: false, reason: "actor_not_admin" };

  if (input.intent.intent === "query_progress") {
    return hasEligibleAggregateArgs(input.intent.args as Record<string, unknown>)
      ? { adopted: true, reason: "adopted_admin_query" }
      : { adopted: false, reason: "argument_shape_not_eligible" };
  }

  if (input.intent.intent === "query_plan_progress") {
    return hasEligiblePlanArgs(input.intent.args as Record<string, unknown>)
      ? { adopted: true, reason: "adopted_admin_query" }
      : { adopted: false, reason: "argument_shape_not_eligible" };
  }

  return { adopted: false, reason: "intent_not_eligible" };
};
