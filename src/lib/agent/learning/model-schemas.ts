import { z } from "zod";

const boundedText = (max: number) => z.string().trim().min(1).max(max);

export const learningMemoryTypeSchema = z.enum([
  "fact",
  "preference",
  "project_context",
  "workflow_rule",
  "writing_style",
]);

export const learningSignalSchema = z.enum([
  "correction",
  "explicit_preference",
  "explicit_workflow_rule",
  "inferred",
]);

const learningCandidateShape = {
  confidence: z.number().finite().min(0).max(1),
  content: boundedText(1_000),
  reason: boundedText(500),
  signal: learningSignalSchema,
  title: boundedText(120),
  type: learningMemoryTypeSchema,
};

export const learningCandidateBaseSchema = z.object(learningCandidateShape);
export const learningCandidateSchema = z.object(learningCandidateShape).strict();

export const learningCandidateResultBaseSchema = z.object({
  candidates: z.array(learningCandidateBaseSchema).max(4),
});

export const learningCandidateResultSchema = z.object({
  candidates: z.array(learningCandidateSchema).max(4),
}).strict();

export type LearningModelCandidate = z.infer<typeof learningCandidateSchema>;
export type LearningModelResult = z.infer<typeof learningCandidateResultSchema>;
