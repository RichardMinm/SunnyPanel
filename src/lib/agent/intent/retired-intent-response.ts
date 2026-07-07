/**
 * R6-C1-D-C: Retired intent response stubs.
 *
 * Previously these functions lived in intent/heuristics/knowledge.ts.
 * They have been retired — definition questions and knowledge answers
 * are now handled by LLM response composer / Tool Planner read path.
 *
 * This file does NOT import from intent/heuristics.
 */

import type { AgentIntent } from "../schemas";

/* ──── parseDefinitionQuestionIntent — always returns null ──── */

export const parseDefinitionQuestionIntent = (_message: string): AgentIntent | null => null;

/* ──── answer-generator stubs (return safe dummy values) ──── */

type RetiredSubject = { aliases: string[]; canonical: string; focus: string[]; sequence: string[] };

const EMPTY_SUBJECT: RetiredSubject = { aliases: [], canonical: "", focus: [], sequence: [] };

export const lookupKnownSubjectByTopic = (_rawTopic: string): RetiredSubject | null => null;

export const resolveSubjectByTopic = (_rawTopic: string): RetiredSubject => EMPTY_SUBJECT;

export const buildExpandedDefinitionAnswer = (_subject: RetiredSubject): string => "";

export const buildDefinitionAnswer = (_subject: RetiredSubject): string => "";
