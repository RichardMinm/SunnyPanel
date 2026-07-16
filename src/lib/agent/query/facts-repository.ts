import type { Checklist, Plan } from "@/payload-types";
import { getPayloadClient } from "@/lib/payload/client";
import type { QueryPlanProgressArgs, QueryProgressArgs } from "../schemas";
import { buildAgentProgressSnapshot, buildPlanProgressFacts, filterChecklistsByTitle } from "./facts";
import { normalizePlanTitle } from "./plan-title";
import type { AggregateProgressFacts, PlanProgressFacts } from "./types";

type FindArgs = { collection: string; depth: 0; limit: number; overrideAccess: true; sort: string };
type FindByIdArgs = { collection: "plans"; disableErrors: true; id: number; overrideAccess: true };
type FindPlansForTitleArgs = { collection: "plans"; depth: 0; overrideAccess: true; pagination: false; sort: "id" };
export type QueryFactsRepositoryDependencies = {
  findAggregatePlans: (args: FindArgs) => Promise<{ docs: Plan[]; totalDocs: number }>;
  findAggregateChecklists: (args: FindArgs) => Promise<{ docs: Checklist[] }>;
  findPlanById: (args: FindByIdArgs) => Promise<Plan | null>;
  findPlansForTitle: (args: FindPlansForTitleArgs) => Promise<{ docs: Plan[] }>;
  now: () => Date;
};

const defaultDependencies = async (): Promise<QueryFactsRepositoryDependencies> => {
  const payload = await getPayloadClient();
  return {
    findAggregatePlans: (args) => payload.find(args as never) as never,
    findAggregateChecklists: (args) => payload.find(args as never) as never,
    findPlanById: (args) => payload.findByID(args) as Promise<Plan | null>,
    findPlansForTitle: (args) => payload.find(args as never) as never,
    now: () => new Date(),
  };
};

export const loadAggregateProgressFacts = async (args: QueryProgressArgs = {}, dependencies?: QueryFactsRepositoryDependencies): Promise<AggregateProgressFacts> => {
  const deps = dependencies ?? await defaultDependencies();
  const [plans, checklists] = await Promise.all([
    deps.findAggregatePlans({ collection: "plans", depth: 0, limit: 100, overrideAccess: true, sort: "dueDate" }),
    deps.findAggregateChecklists({ collection: "checklists", depth: 0, limit: 100, overrideAccess: true, sort: "-updatedAt" }),
  ]);
  const visibleChecklists = filterChecklistsByTitle(checklists.docs, args.checklistTitle);
  return { args, kind: "aggregate_progress", snapshot: buildAgentProgressSnapshot({ checklists: visibleChecklists, now: deps.now(), plans: plans.docs, totalPlans: plans.totalDocs }) };
};

export const loadPlanProgressFacts = async (args: QueryPlanProgressArgs, dependencies?: QueryFactsRepositoryDependencies): Promise<PlanProgressFacts | null> => {
  const deps = dependencies ?? await defaultDependencies();
  let plan: Plan | null = null;
  if (args.planId) {
    plan = await deps.findPlanById({ collection: "plans", disableErrors: true, id: args.planId, overrideAccess: true });
    if (
      plan
      && args.planTitle
      && normalizePlanTitle(plan.title) !== normalizePlanTitle(args.planTitle)
    ) plan = null;
  }
  else if (args.planTitle) {
    const result = await deps.findPlansForTitle({ collection: "plans", depth: 0, overrideAccess: true, pagination: false, sort: "id" });
    const query = normalizePlanTitle(args.planTitle);
    const matches = result.docs.filter((item) => normalizePlanTitle(item.title) === query);
    plan = matches.length === 1 ? matches[0] : null;
  }
  return plan ? buildPlanProgressFacts(plan) : null;
};
