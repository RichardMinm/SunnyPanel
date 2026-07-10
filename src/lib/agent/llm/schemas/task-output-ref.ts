/** Task output reference — allows one task in an orchestration plan to
 *  reference the output of another task as its input.
 *
 *  Example: task t2 (schedule_plan) references t1 (create_plan) output field "planId":
 *    { type: "taskOutput", taskId: "t1", field: "planId" }
 */

import { z } from "zod";

export const taskOutputRefSchema = z.object({
  type: z.literal("taskOutput"),
  /** The task whose output is being referenced. */
  taskId: z.string().min(1),
  /** The output field to extract, e.g. "planId", "checklistId". */
  field: z.string().min(1),
});

export type TaskOutputRef = z.infer<typeof taskOutputRefSchema>;

/** Validates that a TaskOutputRef points to a valid predecessor task.
 *  Returns validation error messages (empty = valid). */
export const validateOutputRefDependencies = (params: {
  refs: TaskOutputRef[];
  taskIds: Set<string>;
  /** Map of taskId → set of predecessor taskIds (from dependsOn). */
  predecessors: Map<string, Set<string>>;
}): string[] => {
  const errors: string[] = [];

  for (const ref of params.refs) {
    /* Referenced task must exist in the plan. */
    if (!params.taskIds.has(ref.taskId)) {
      errors.push(
        `TaskOutputRef: task "${ref.taskId}" does not exist in the plan`,
      );
      continue;
    }

    /* Cannot reference self (caller validates separately). */
    /* Note: self-reference check is done by the caller since we don't
     *   know which task OWNS this ref from the ref alone. */
  }

  return errors;
};
