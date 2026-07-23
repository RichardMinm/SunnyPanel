import { z } from "zod";

import type { StructuredOutputDiagnostics } from "../llm/model-errors";
import {
  orchestratorOutputSchema,
  type OrchestratorOutput,
} from "../llm/schemas/orchestrator-output";

const requiredNonEmptyStringFields = Object.freeze(["content"] as const);

export const SAVE_MEMORY_ORCHESTRATOR_ARGS_CONTRACT = Object.freeze({
  intent: "save_memory" as const,
  requiredNonEmptyStringFields,
});

export type OrchestratorTaskArgsIssue = Readonly<{
  code: "required_non_empty_string";
  field: "content";
  intent: "save_memory";
  taskIndex: number;
}>;

export const validateOrchestratorTaskArgs = (
  output: OrchestratorOutput,
): Readonly<{
  issues: readonly OrchestratorTaskArgsIssue[];
  valid: boolean;
}> => {
  const issues: OrchestratorTaskArgsIssue[] = [];

  output.tasks.forEach((task, taskIndex) => {
    if (task.intent !== SAVE_MEMORY_ORCHESTRATOR_ARGS_CONTRACT.intent) return;
    const field =
      SAVE_MEMORY_ORCHESTRATOR_ARGS_CONTRACT
        .requiredNonEmptyStringFields[0];
    const value = task.args[field];
    if (typeof value !== "string" || value.trim().length === 0) {
      issues.push(Object.freeze({
        code: "required_non_empty_string",
        field,
        intent: "save_memory",
        taskIndex,
      }));
    }
  });

  return Object.freeze({
    issues: Object.freeze(issues),
    valid: issues.length === 0,
  });
};

export const orchestratorOutputWithTaskArgsSchema =
  orchestratorOutputSchema.superRefine((output, context) => {
    for (const issue of validateOrchestratorTaskArgs(output).issues) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Required intent argument is invalid.",
        path: ["tasks", issue.taskIndex, "args", issue.field],
      });
    }
  });

export const renderOrchestratorTaskArgsProtocol = (): string => {
  const field =
    SAVE_MEMORY_ORCHESTRATOR_ARGS_CONTRACT.requiredNonEmptyStringFields[0];
  return [
    "[orchestrator-task-args-contract:v1]",
    `- ${SAVE_MEMORY_ORCHESTRATOR_ARGS_CONTRACT.intent}: args.${field} is required and must be a non-empty string.`,
  ].join("\n");
};

const isSaveMemoryContentPath = (
  path: readonly (number | string)[],
): path is readonly ["tasks", number, "args", "content"] =>
  path.length === 4
  && path[0] === "tasks"
  && typeof path[1] === "number"
  && path[2] === "args"
  && path[3]
    === SAVE_MEMORY_ORCHESTRATOR_ARGS_CONTRACT
      .requiredNonEmptyStringFields[0];

export const buildOrchestratorTaskArgsRepairInstruction = (
  issues: StructuredOutputDiagnostics["issues"],
): string => {
  const paths = issues
    .map(({ path }) => path)
    .filter(isSaveMemoryContentPath)
    .map((path) => path.join("."));
  const uniquePaths = [...new Set(paths)];
  const detail = uniquePaths.length > 0
    ? `Required non-empty string fields: ${uniquePaths.join(", ")}.`
    : "The previous object violated the Structured Output schema.";
  return [
    "[orchestrator-task-args-repair:v1]",
    detail,
    "Return the complete Orchestrator JSON object again.",
  ].join("\n");
};
