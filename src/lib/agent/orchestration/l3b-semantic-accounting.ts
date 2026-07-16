export const L3B_MISMATCH_CATEGORIES = [
  "clarify_mismatch",
  "intent_mismatch",
  "match",
  "mode_mismatch",
  "not_comparable",
  "query_scope_mismatch",
  "read_write_mismatch",
  "resource_mismatch",
  "unclassified",
] as const;

export type L3BMismatchCategory =
  (typeof L3B_MISMATCH_CATEGORIES)[number];

type IntentContract = Readonly<{
  actualIntents: readonly string[];
  expectedIntents: readonly string[];
  expectedMode: "compound" | "single";
}>;

export const matchesExpectedIntentContract = (
  contract: IntentContract,
): boolean => {
  if (contract.expectedMode === "single") {
    return contract.actualIntents.length === 1
      && contract.expectedIntents.includes(contract.actualIntents[0] ?? "");
  }

  return contract.actualIntents.length === contract.expectedIntents.length
    && contract.actualIntents.every(
      (intent, index) => intent === contract.expectedIntents[index],
    );
};

type SemanticAccountingObservation = Readonly<{
  decisionCodeCorrect: boolean;
  mismatchCategory: L3BMismatchCategory;
  schemaValid: boolean;
}>;

export type L3BSemanticAccounting = Readonly<{
  comparable: number;
  decisionCodeCorrect: number;
  exclusiveCategories: Record<L3BMismatchCategory, number>;
  exclusiveCategoryTotal: number;
  observations: number;
  semanticCorrect: number;
  semanticIncorrect: number;
}>;

const invariantError = (message: string): never => {
  throw new Error(`L3-B semantic accounting invariant failed: ${message}`);
};

export const reconcileSemanticAccounting = (
  observations: readonly SemanticAccountingObservation[],
): L3BSemanticAccounting => {
  const exclusiveCategories = Object.fromEntries(
    L3B_MISMATCH_CATEGORIES.map((category) => [category, 0]),
  ) as Record<L3BMismatchCategory, number>;

  for (const observation of observations) {
    const categoryComparable = observation.mismatchCategory !== "not_comparable";
    if (observation.schemaValid !== categoryComparable) {
      invariantError(
        `schemaValid=${observation.schemaValid} contradicts category=${observation.mismatchCategory}`,
      );
    }
    exclusiveCategories[observation.mismatchCategory] += 1;
  }

  const observationCount = observations.length;
  const exclusiveCategoryTotal = Object.values(exclusiveCategories)
    .reduce((total, count) => total + count, 0);
  const comparable = observationCount - exclusiveCategories.not_comparable;
  const semanticCorrect = exclusiveCategories.match;
  const semanticIncorrect = comparable - semanticCorrect;

  if (exclusiveCategoryTotal !== observationCount) {
    invariantError("exclusive category total does not equal observations");
  }
  if (semanticCorrect + semanticIncorrect !== comparable) {
    invariantError("semantic correct plus incorrect does not equal comparable");
  }

  return Object.freeze({
    comparable,
    decisionCodeCorrect: observations.filter(
      ({ decisionCodeCorrect, schemaValid }) => schemaValid && decisionCodeCorrect,
    ).length,
    exclusiveCategories: Object.freeze(exclusiveCategories),
    exclusiveCategoryTotal,
    observations: observationCount,
    semanticCorrect,
    semanticIncorrect,
  });
};
