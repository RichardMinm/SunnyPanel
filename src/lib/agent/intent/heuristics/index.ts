export { cleanupText } from "./shared-text";
export { inferMemoryType } from "./memory";
export {
  isBatchConfirmationReply,
  isCancellationReply,
  isConfirmationReply,
  isNegativeReply,
  shouldSkipPendingAction,
} from "./replies";
export {
  extractConsultationTopic,
  isGeneralConsultationQuestion,
  isLearningAdviceQuestion,
  isMathTwoSyllabusQuestion,
  parseKnowledgeAnswerIntent,
} from "./knowledge";
export { collectHeuristicCandidates, parseHeuristicIntent } from "./parse-heuristic-intent";

export type HeuristicCandidate = {
  intent: import("../../schemas").AgentIntent;
  source: string;
};

export {
  appendItemKeywords,
  completionKeywords,
  composePlanKeywords,
  createPlanKeywords,
  evaluationKeywords,
  memoryKeywords,
  noteKeywords,
  progressKeywords,
  scheduleComposerKeywords,
  schedulePlanKeywords,
  timelineComposerKeywords,
  weeklyReviewKeywords,
} from "./keywords";

export { parseChecklistGroupMention, parseChecklistMention } from "./shared-text";

export { parseCompleteItemIntent, parseExplicitNoteIntent } from "./checklist";
export {
  parseAppendPlanItemIntent,
  parseComposePlanIntent,
  parseComposeScheduleItemIntent,
  parseCreatePlanIntent,
  parseSchedulePlanIntent,
} from "./plan-schedule";
export { parseEvaluatePlanIntent, parseProgressIntent } from "./progress-review";
export { parseComposeTimelineEventIntent } from "./timeline";
export { parseSaveMemoryIntent } from "./memory";
export {
  parseCapabilityQueryIntent,
  parseCreateChecklistIntent,
  parseCreateTimelineIntent,
  parseQueryChecklistProgressIntent,
  parseQueryMemoryIntent,
  parseQueryPlanIntent,
  parseQueryScheduleIntent,
  parseQueryTimelineIntent,
} from "./query";
export { parseDeleteRecordIntent, parseModifyRecordIntent } from "./delete-update";

import {
  appendItemKeywords,
  completionKeywords,
  composePlanKeywords,
  createPlanKeywords,
  evaluationKeywords,
  memoryKeywords,
  noteKeywords,
  progressKeywords,
  scheduleComposerKeywords,
  schedulePlanKeywords,
  timelineComposerKeywords,
  weeklyReviewKeywords,
} from "./keywords";
import { isGeneralConsultationQuestion, isLearningAdviceQuestion, isMathTwoSyllabusQuestion } from "./knowledge";

export const isNewCommand = (message: string) =>
  createPlanKeywords.some((keyword) => message.includes(keyword)) ||
  composePlanKeywords.some((keyword) => message.includes(keyword)) ||
  scheduleComposerKeywords.some((keyword) => message.includes(keyword)) ||
  appendItemKeywords.some((keyword) => message.includes(keyword)) ||
  completionKeywords.some((keyword) => message.includes(keyword)) ||
  noteKeywords.some((keyword) => message.includes(keyword)) ||
  memoryKeywords.some((keyword) => message.includes(keyword)) ||
  progressKeywords.some((keyword) => message.includes(keyword)) ||
  timelineComposerKeywords.some((keyword) => message.includes(keyword)) ||
  weeklyReviewKeywords.some((keyword) => message.includes(keyword)) ||
  evaluationKeywords.some((keyword) => message.includes(keyword)) ||
  schedulePlanKeywords.some((keyword) => message.includes(keyword)) ||
  isMathTwoSyllabusQuestion(message) ||
  isLearningAdviceQuestion(message) ||
  isGeneralConsultationQuestion(message);
