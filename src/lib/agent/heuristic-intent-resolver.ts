/**
 * 薄 re-export 层——实际实现已拆到 intent/heuristics/*.ts。
 * 保留此文件是为了不破坏已有 import 路径。
 */
export {
  cleanupText,
  inferMemoryType,
  isCancellationReply,
  isConfirmationReply,
  isMathTwoSyllabusQuestion,
  isNegativeReply,
  isNewCommand,
  parseHeuristicIntent,
  parseKnowledgeAnswerIntent,
  shouldSkipPendingAction,
} from "./intent/heuristics";
