import type {
  OrchestratorOutput,
  OrchestratorTask,
} from "../llm/schemas/orchestrator-output";
import { classifyIntent } from "./safety-classifier";

export const CONSULTATION_INTENTS = Object.freeze([
  "answer_question",
  "compare_concepts",
  "explain_concept",
  "give_examples",
  "give_learning_path",
] as const);

export const READ_QUERY_INTENTS = Object.freeze([
  "capability_query",
  "evaluate_plan",
  "query_checklist_progress",
  "query_memory",
  "query_plan",
  "query_plan_progress",
  "query_progress",
  "query_schedule",
  "query_timeline",
  "summarize_answer",
  "rewrite_answer",
] as const);

export type DecisionConsistencyErrorCode =
  | "clarify_mode_mismatch"
  | "compound_contains_clarify"
  | "compound_missing_write"
  | "compound_mode_mismatch"
  | "compound_task_count_mismatch"
  | "consultation_intent_mismatch"
  | "consultation_mode_mismatch"
  | "missing_clarify_question"
  | "read_intent_not_allowed"
  | "read_mode_mismatch"
  | "unsupported_mode_mismatch"
  | "unsupported_task_mismatch"
  | "write_intent_not_allowed"
  | "write_mode_mismatch";

export type DecisionConsistencyResult =
  | { valid: true }
  | { valid: false; code: DecisionConsistencyErrorCode };

const consultationIntents = new Set<string>(CONSULTATION_INTENTS);
const readQueryIntents = new Set<string>(READ_QUERY_INTENTS);

const invalid = (
  code: DecisionConsistencyErrorCode,
): DecisionConsistencyResult => ({ valid: false, code });

const hasNonBlankClarifyQuestion = (task: OrchestratorTask): boolean =>
  task.intent === "clarify"
  && typeof task.args.question === "string"
  && task.args.question.trim().length > 0;

export const validateOrchestratorDecisionConsistency = (
  output: OrchestratorOutput,
): DecisionConsistencyResult => {
  switch (output.decisionCode) {
    case "pure_consultation":
      if (output.mode !== "single") {
        return invalid("consultation_mode_mismatch");
      }
      if (
        output.tasks.length !== 1
        || !consultationIntents.has(output.tasks[0].intent)
      ) {
        return invalid("consultation_intent_mismatch");
      }
      return { valid: true };

    case "pure_read_query":
      if (output.mode !== "single") return invalid("read_mode_mismatch");
      if (
        output.tasks.length !== 1
        || !readQueryIntents.has(output.tasks[0].intent)
        || classifyIntent(output.tasks[0].intent) !== "read"
      ) {
        return invalid("read_intent_not_allowed");
      }
      return { valid: true };

    case "explicit_write_ready":
      if (output.mode !== "single") return invalid("write_mode_mismatch");
      if (
        output.tasks.length !== 1
        || classifyIntent(output.tasks[0].intent) !== "write_candidate"
      ) {
        return invalid("write_intent_not_allowed");
      }
      return { valid: true };

    case "explicit_write_missing_resource":
    case "compound_missing_target":
      if (output.mode !== "single") return invalid("clarify_mode_mismatch");
      if (
        output.tasks.length !== 1
        || !hasNonBlankClarifyQuestion(output.tasks[0])
      ) {
        return invalid("missing_clarify_question");
      }
      return { valid: true };

    case "compound_ready":
      if (output.mode !== "compound") {
        return invalid("compound_mode_mismatch");
      }
      if (output.tasks.length < 2) {
        return invalid("compound_task_count_mismatch");
      }
      if (output.tasks.some((task) => task.intent === "clarify")) {
        return invalid("compound_contains_clarify");
      }
      if (
        !output.tasks.some(
          (task) => classifyIntent(task.intent) === "write_candidate",
        )
      ) {
        return invalid("compound_missing_write");
      }
      return { valid: true };

    case "unsupported_request":
      if (output.mode !== "single") {
        return invalid("unsupported_mode_mismatch");
      }
      if (output.tasks.length !== 1 || output.tasks[0].intent !== "clarify") {
        return invalid("unsupported_task_mismatch");
      }
      if (!hasNonBlankClarifyQuestion(output.tasks[0])) {
        return invalid("missing_clarify_question");
      }
      return { valid: true };
  }
};
