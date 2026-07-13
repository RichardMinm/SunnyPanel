import type { QueryStreamTerminalState } from "./types";

type FailedTerminal = Exclude<QueryStreamTerminalState, { status: "complete" }>;

export class QueryStreamFailure extends Error {
  readonly safeAssistantMessage = "只读查询暂时不可用，请稍后重试。";
  readonly safeMessage = "Read-only query unavailable";
  readonly terminal: FailedTerminal;

  constructor(terminal: FailedTerminal) {
    super("Read-only query unavailable");
    this.name = "QueryStreamFailure";
    this.terminal = terminal;
  }
}

export const isQueryStreamFailure = (value: unknown): value is QueryStreamFailure => value instanceof QueryStreamFailure;
