import { z } from "zod";

const boundedText = (max: number) => z.string().trim().min(1).max(max);
const boundedTextList = (maxItems: number, maxText: number) =>
  z.array(boundedText(maxText)).max(maxItems);

const weeklyReviewInsightsShape = {
  narrativeGaps: boundedTextList(5, 500),
  recommendations: boundedTextList(5, 500),
  summaryTone: boundedText(1_200),
};

export const weeklyReviewInsightsBaseSchema = z.object(
  weeklyReviewInsightsShape,
);
export const weeklyReviewInsightsSchema = z.object(
  weeklyReviewInsightsShape,
).strict();

const evaluationEnhancementShape = {
  recommendations: boundedTextList(5, 500),
  summary: boundedText(1_200),
};

export const evaluationEnhancementBaseSchema = z.object(
  evaluationEnhancementShape,
);
export const evaluationEnhancementSchema = z.object(
  evaluationEnhancementShape,
).strict();

const metricValueSchema = z.union([
  z.number().finite(),
  z.string().trim().min(1).max(200),
]);

const relatedContentSchema = z.object({
  relationTo: z.enum([
    "checklists",
    "notes",
    "pages",
    "posts",
    "timeline-events",
    "updates",
  ]),
  value: z.number().int().positive(),
}).strict();

const suggestionDraftSchema = z.object({
  createdBy: z.literal("agent"),
  reason: boundedText(1_000),
  relatedContent: z.array(relatedContentSchema).max(8).optional(),
  relatedPlan: z.number().int().positive().optional(),
  riskLevel: z.enum(["high", "low", "medium"]),
  source: z.literal("review"),
  status: z.literal("pending"),
  suggestedPrompt: boundedText(1_000),
  title: boundedText(240),
  uniqueKey: boundedText(500),
}).strict();

const frozenWeeklyReviewProposalShape = {
  assistantMessage: boundedText(8_000),
  completed: boundedTextList(10, 500).min(1),
  createSuggestions: z.boolean(),
  health: z.enum(["attention", "healthy", "risk"]),
  metrics: z.record(z.string().trim().min(1).max(100), metricValueSchema),
  narrativeGaps: boundedTextList(10, 500).min(1),
  recommendations: boundedTextList(10, 500).min(1),
  reviewedAt: z.string().datetime({ offset: true }),
  risks: boundedTextList(10, 500).min(1),
  scope: z.literal("overall"),
  snapshotFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  source: z.enum(["deterministic", "model"]),
  suggestionDrafts: z.array(suggestionDraftSchema).max(8),
  summary: boundedText(8_000),
  title: boundedText(240),
};

export const frozenWeeklyReviewProposalSchema = z.object(
  frozenWeeklyReviewProposalShape,
).strict();

export type EvaluationEnhancement = z.infer<
  typeof evaluationEnhancementSchema
>;
export type FrozenWeeklyReviewProposal = z.infer<
  typeof frozenWeeklyReviewProposalSchema
>;
export type WeeklyReviewLLMInsights = z.infer<
  typeof weeklyReviewInsightsSchema
>;
