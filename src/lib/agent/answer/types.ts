export type SafeAnswerErrorCode =
  | "cancelled"
  | "empty_stream"
  | "first_token_timeout"
  | "invalid_block"
  | "overflow"
  | "provider_error"
  | "tool_call"
  | "total_timeout";

export type ConversationalAnswerTerminalState =
  | {
      answer: string;
      persist: true;
      status: "complete";
    }
  | {
      errorCode: SafeAnswerErrorCode;
      persist: false;
      status: "unavailable";
    }
  | {
      errorCode: SafeAnswerErrorCode;
      partialOutputEmitted: true;
      persist: false;
      status: "incomplete";
    };
