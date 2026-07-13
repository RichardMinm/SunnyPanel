import type { Checklist, Plan } from "@/payload-types";
import { getPayloadClient } from "@/lib/payload/client";
import type { QueryPlanProgressArgs, QueryProgressArgs } from "../schemas";
import { buildAgentProgressSnapshot, buildPlanProgressFacts, filterChecklistsByTitle } from "./facts";
import type { AggregateProgressFacts, PlanProgressFacts } from "./types";

type FindArgs = { collection: string; depth: 0; limit: number; overrideAccess: true; sort: string };
type FindByIdArgs = { collection: "plans"; id: number; overrideAccess: true };
export type QueryFactsRepositoryDependencies = {
  findAggregatePlans: (args: FindArgs) => Promise<{ docs: Plan[]; totalDocs: number }>;
  findAggregateChecklists: (args: FindArgs) => Promise<{ docs: Checklist[] }>;
  findPlanById: (args: FindByIdArgs) => Promise<Plan | null>;
  findPlansForTitle: (args: FindArgs) => Promise<{ docs: Plan[] }>;
  now: () => Date;
};

const defaultDependencies = async (): Promise<QueryFactsRepositoryDependencies> => {
  const payload = await getPayloadClient();
  return {
    findAggregatePlans: (args) => payload.find(args as never) as never,
    findAggregateChecklists: (args) => payload.find(args as never) as never,
    findPlanById: (args) => payload.findByID(args) as Promise<Plan>,
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
  if (args.planId) plan = await deps.findPlanById({ collection: "plans", id: args.planId, overrideAccess: true });
  else if (args.planTitle) {
    const result = await deps.findPlansForTitle({ collection: "plans", depth: 0, limit: 10, overrideAccess: true, sort: "-updatedAt" });
    const query = args.planTitle.toLowerCase();
    plan = result.docs.find((item) => item.title.toLowerCase().includes(query) || query.includes(item.title.toLowerCase())) ?? null;
  }
  return plan ? buildPlanProgressFacts(plan) : null;
};
