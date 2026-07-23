import type { AgentPromptContext } from "../prompts";
import { normalizePlanTitle } from "../query/plan-title";

export type TrustedContextPlan = Readonly<{
  id: number;
  title: string;
}>;

export type PlanReferenceEvidence = Readonly<{
  exactTitlePlans: readonly TrustedContextPlan[];
  explicitPlanIds: readonly number[];
  trustedPlans: readonly TrustedContextPlan[];
}>;

export const isPositivePlanId = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

const collectExplicitPlanIds = (message: string): readonly number[] => {
  const normalized = message.normalize("NFKC");
  const ids = new Set<number>();
  const patterns = [
    /(?:plan\s*id|planid)\s*[:=#]?\s*(\d+)/giu,
    /计划\s*(?:id|编号|#)\s*[:=#：]?\s*(\d+)/giu,
    /计划\s*[:：#]?\s+(\d+)/gu,
  ];

  for (const pattern of patterns) {
    for (const match of normalized.matchAll(pattern)) {
      const value = Number(match[1]);
      if (isPositivePlanId(value)) ids.add(value);
    }
  }

  return Object.freeze([...ids]);
};

const trustedPlans = (
  context: AgentPromptContext,
): readonly TrustedContextPlan[] => Object.freeze(
  context.plans
    .filter(
      (plan): plan is typeof plan & { id: number } =>
        isPositivePlanId(plan.id),
    )
    .map(({ id, title }) => Object.freeze({ id, title })),
);

export const analyzePlanReferenceEvidence = (
  input: Readonly<{
    context: AgentPromptContext;
    message: string;
  }>,
): PlanReferenceEvidence => {
  const trusted = trustedPlans(input.context);
  const normalizedMessage = normalizePlanTitle(input.message);
  const exactTitlePlans = trusted.filter(({ title }) => {
    const normalizedTitle = normalizePlanTitle(title);
    return normalizedTitle.length > 0
      && normalizedMessage.includes(normalizedTitle);
  });

  return Object.freeze({
    exactTitlePlans: Object.freeze([...exactTitlePlans]),
    explicitPlanIds: collectExplicitPlanIds(input.message),
    trustedPlans: trusted,
  });
};
