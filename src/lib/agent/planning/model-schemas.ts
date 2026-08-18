import { z } from "zod";

const nonEmptyText = (max: number) => z.string().trim().min(1).max(max);
const positiveInteger = (max: number) => z.number().int().min(1).max(max);

const milestoneShape = {
  estimatedHours: z.number().positive().max(1_000),
  tasks: z.array(nonEmptyText(240)).min(1).max(8),
  title: nonEmptyText(120),
};

export const planDecompositionMilestoneBaseSchema = z.object(milestoneShape);
export const planDecompositionMilestoneSchema = z.object(milestoneShape).strict();

const phaseBaseShape = {
  estimatedDays: positiveInteger(3_650),
  goal: nonEmptyText(600),
  milestones: z.array(planDecompositionMilestoneBaseSchema).min(1).max(4),
  title: nonEmptyText(120),
};

const phaseStrictShape = {
  ...phaseBaseShape,
  milestones: z.array(planDecompositionMilestoneSchema).min(1).max(4),
};

export const planDecompositionPhaseBaseSchema = z.object(phaseBaseShape);
export const planDecompositionPhaseSchema = z.object(phaseStrictShape).strict();

const planBaseShape = {
  finalGoal: nonEmptyText(800),
  phases: z.array(planDecompositionPhaseBaseSchema).min(1).max(6),
  prerequisites: z.array(nonEmptyText(240)).max(20),
  totalEstimatedDays: positiveInteger(3_650),
  weeklyRhythm: nonEmptyText(600),
};

const planStrictShape = {
  ...planBaseShape,
  phases: z.array(planDecompositionPhaseSchema).min(1).max(6),
};

/** Provider-facing construction schema; final output is always revalidated by
 * planDecompositionSchema so unknown keys at every nesting level are rejected. */
export const planDecompositionBaseSchema = z.object(planBaseShape);
export const planDecompositionSchema = z.object(planStrictShape).strict();
export type PlanningModelDecomposition = z.infer<typeof planDecompositionSchema>;

const checklistItemShape = {
  description: nonEmptyText(600).nullable(),
  priority: z.enum(["high", "medium", "low"]).nullable(),
  title: nonEmptyText(160),
};

export const checklistDraftItemBaseSchema = z.object(checklistItemShape);
export const checklistDraftItemSchema = z.object(checklistItemShape).strict();

const checklistDraftBaseShape = {
  goal: nonEmptyText(600).nullable(),
  items: z.array(checklistDraftItemBaseSchema).min(1).max(20),
  title: nonEmptyText(160).nullable(),
};

const checklistDraftStrictShape = {
  ...checklistDraftBaseShape,
  items: z.array(checklistDraftItemSchema).min(1).max(20),
};

export const checklistDraftFactsBaseSchema = z.object(checklistDraftBaseShape);
export const checklistDraftFactsSchema = z.object(checklistDraftStrictShape).strict();
export type ChecklistDraftFacts = z.infer<typeof checklistDraftFactsSchema>;
