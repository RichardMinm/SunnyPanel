import type { ClarificationComposerInput, ClarificationComposerOutput } from "./types";

/**
 * Deterministic fallback composer for clarification messages.
 *
 * Produces natural-sounding Chinese text WITHOUT exposing internal field names
 * (sourceType, missingSlots, conflictPolicy, priorityRule, availableTimeWindows,
 * dailyCapacity, goal, deadline, scope, currentProgress, successCriteria, etc).
 *
 * Must always:
 * - State clearly that nothing will be written yet
 * - State clearly that the next step is to generate a draft
 * - Provide a suggestedReply the user can copy
 * - Limit questions to maxQuestions
 */
export const composeClarificationFallback = (
  input: ClarificationComposerInput,
): ClarificationComposerOutput => {
  const isSchedule = input.workflow === "schedule_creation";

  const goalLine = input.userGoalSummary
    ? `你希望${input.userGoalSummary}。`
    : "我理解你的需求。";

  const knownLines = input.knownFacts.length > 0
    ? input.knownFacts.map((f) => `- ${f}`).join("\n")
    : null;

  const questionCount = Math.min(input.maxQuestions, input.missingNeeds.length, isSchedule ? 3 : 4);
  const needs = input.missingNeeds.slice(0, questionCount);

  const questionLines = needs.map((need, index) => {
    let line = `${index + 1}. ${need.label}`;
    if (need.examples && need.examples.length > 0) {
      line += `（比如：${need.examples.join("、")}）`;
    }
    line += "？";
    return line;
  });

  const nextStepLabel = input.safetyBoundary.nextStep;
  const entityLabel = isSchedule ? "日程" : "计划";

  const suggestedParts = needs.map((need) => {
    if (need.examples && need.examples.length > 0) return need.examples[0];
    return need.label;
  });
  const suggestedReply = suggestedParts.length > 0
    ? suggestedParts.join("，")
    : isSchedule
      ? "每天 1 小时，晚上，有冲突就跳过"
      : "每天 1 小时，先完成核心功能";

  const message = [
    `可以，我先不直接写入${entityLabel}。`,
    goalLine,
    knownLines ? `\n已知信息：\n${knownLines}` : null,
    needs.length > 0
      ? `\n为了把安排做得更准确，还需要确认 ${needs.length} 个问题：\n\n${questionLines.join("\n\n")}`
      : null,
    `\n你可以直接这样回复：\n"${suggestedReply}"`,
    `\n确认后，我会${nextStepLabel}给你看，暂时不会写入${entityLabel}。`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    message,
    questions: needs.map((n) => n.label),
    safetyNote: `暂时不会写入${entityLabel}，下一步会${nextStepLabel}`,
    source: "fallback",
    suggestedReply,
  };
};
