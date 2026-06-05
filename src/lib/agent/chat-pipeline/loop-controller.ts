import type { AgentChatResponse, AgentTraceStep, PendingAction, ProposedAgentAction } from "../schemas";
import type { StreamTokenCallback } from "../client";
import { estimateTokenCount } from "../token-usage";

export type LoopPhase = "orchestrate" | "resolve" | "dryrun" | "execute" | "observe" | "done";

export type LoopState = {
  completedActions: ProposedAgentAction[];
  currentAssistantMessage: string;
  iteration: number;
  lastPendingAction: null | PendingAction;
  phase: LoopPhase;
  remainingTasks: number;
  startTime: number;
};

export class TokenBudget {
  readonly maxContextTokens: number;
  readonly maxOutputTokens: number;
  used: { context: number; input: number; output: number };

  constructor(opts: { maxContextTokens?: number; maxOutputTokens?: number } = {}) {
    this.maxContextTokens = opts.maxContextTokens ?? 128000;
    this.maxOutputTokens = opts.maxOutputTokens ?? 16000;
    this.used = { context: 0, input: 0, output: 0 };
  }

  canContinue(): boolean {
    return (
      this.used.context < this.maxContextTokens * 0.9 &&
      this.used.output < this.maxOutputTokens
    );
  }

  consumeContext(n: number): void {
    this.used.context += n;
  }

  consumeOutput(n: number): void {
    this.used.output += n;
  }

  summary(): string {
    return `context: ${this.used.context}/${this.maxContextTokens}, output: ${this.used.output}/${this.maxOutputTokens}`;
  }
}

const MAX_ITERATIONS = 10;
const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

type LoopCallbacks = {
  emitStatus: (status: string) => void;
  emitToken: StreamTokenCallback;
  emitTrace: (step: AgentTraceStep) => void;
  emitUsage: (tokenUsage: AgentChatResponse["tokenUsage"]) => void;
};

/**
 * Observes the last assistant message to decide the next loop phase.
 * Semantic observer — no LLM needed for phase transitions.
 */
const observeNextPhase = (
  lastAssistantMessage: string,
  lastPendingAction: null | PendingAction,
  _remainingTasks: number,
): LoopPhase => {
  if (lastPendingAction) {
    if (
      lastPendingAction.type === "await_confirmation" ||
      lastPendingAction.type === "await_batch_confirmation"
    ) {
      // Need user confirmation, stop the loop
      return "done";
    }

    if (lastPendingAction.type === "await_clarification") {
      return "done";
    }

    if (lastPendingAction.type === "await_completion_note") {
      return "done";
    }

    if (lastPendingAction.type === "await_learning_followup") {
      return "done";
    }
  }

  // remainingTasks is tracked but the current orchestrator processes all tasks
  // per invocation, so this signal does not drive loop continuation yet.

  // Check if the message indicates more work is needed
  const hasRemainingWork =
    lastAssistantMessage.includes("还有") && lastAssistantMessage.includes("项操作待");
  const hasBatchConfirm = lastAssistantMessage.includes("批量确认");

  if (hasRemainingWork) {
    return "resolve";
  }

  if (hasBatchConfirm) {
    return "done";
  }

  return "done";
};

export const createLoopController = (
  callbacks: LoopCallbacks,
  budget: TokenBudget = new TokenBudget(),
) => {
  const state: LoopState = {
    completedActions: [],
    currentAssistantMessage: "",
    iteration: 0,
    lastPendingAction: null,
    phase: "orchestrate",
    remainingTasks: 0,
    startTime: Date.now(),
  };

  const shouldContinue = (): boolean => {
    if (state.phase === "done") return false;
    if (state.iteration >= MAX_ITERATIONS) {
      callbacks.emitToken("\n• 已达到最大执行轮次，暂停执行。\n", "thinking");

      return false;
    }

    if (!budget.canContinue()) {
      callbacks.emitToken(`\n• Token 预算已用尽（${budget.summary()}），暂停执行。\n`, "thinking");

      return false;
    }

    if (Date.now() - state.startTime > TIMEOUT_MS) {
      callbacks.emitToken("\n• 执行超时，暂停。可在新对话中继续。\n", "thinking");

      return false;
    }

    return true;
  };

  const advance = (phase: LoopPhase): void => {
    state.phase = phase;
    state.iteration += 1;
  };

  const setLastResponse = (message: string, pendingAction: null | PendingAction): void => {
    state.currentAssistantMessage = message;
    state.lastPendingAction = pendingAction;
    budget.consumeOutput(estimateTokenCount(message));
  };

  const setRemainingTasks = (count: number): void => {
    state.remainingTasks = count;
  };

  const recordCompletedAction = (action: ProposedAgentAction): void => {
    state.completedActions.push(action);
  };

  const observe = (): LoopPhase => {
    const next = observeNextPhase(
      state.currentAssistantMessage,
      state.lastPendingAction,
      state.remainingTasks,
    );

    return next;
  };

  const buildProgressSummary = (): string => {
    const elapsed = Math.round((Date.now() - state.startTime) / 1000);
    const completed = state.completedActions.length;

    if (completed > 0) {
      return `已完成 ${completed} 项操作（${elapsed}s，${state.iteration} 轮）`;
    }

    return `${state.iteration} 轮执行（${elapsed}s）`;
  };

  return {
    advance,
    budget,
    buildProgressSummary,
    observe,
    recordCompletedAction,
    setLastResponse,
    setRemainingTasks,
    shouldContinue,
    state,
  };
};

export type LoopController = ReturnType<typeof createLoopController>;
