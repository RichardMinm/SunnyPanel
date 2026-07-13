import type {
  ConversationalAnswerTerminalState,
} from "./types";

type FailedAnswerTerminal = Exclude<
  ConversationalAnswerTerminalState,
  { status: "complete" }
>;

export class ConversationalAnswerStreamFailure extends Error {
  readonly safeAssistantMessage = "回答暂时不可用，请稍后重试。";
  readonly safeMessage = "Conversational answer unavailable";
  readonly terminal: FailedAnswerTerminal;

  constructor(terminal: FailedAnswerTerminal) {
    super("Conversational answer unavailable");
    this.name = "ConversationalAnswerStreamFailure";
    this.terminal = terminal;
  }
}

export const isConversationalAnswerStreamFailure = (
  value: unknown,
): value is ConversationalAnswerStreamFailure =>
  value instanceof ConversationalAnswerStreamFailure;
