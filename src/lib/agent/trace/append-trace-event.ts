import { sanitizeAgentTraceEvent } from "./sanitize";
import type {
  AppendAgentTraceEventInput,
  AppendAgentTraceEventResult,
} from "./types";

const TRACE_WRITE_FAILURE_MESSAGE = "trace_write_failed: 追踪记录未能保存。";

export const appendAgentTraceEvent = async ({
  alreadySanitized = false,
  collector,
  event,
  onWarning,
  sink,
}: AppendAgentTraceEventInput): Promise<AppendAgentTraceEventResult> => {
  const sanitizedEvent = alreadySanitized ? event : sanitizeAgentTraceEvent(event);

  collector?.push(sanitizedEvent);

  if (!sink) {
    return {
      event: sanitizedEvent,
      persisted: false,
      writeFailed: false,
    };
  }

  try {
    await sink(sanitizedEvent);

    return {
      event: sanitizedEvent,
      persisted: true,
      writeFailed: false,
    };
  } catch (error) {
    onWarning?.(error);

    return {
      errorMessage: TRACE_WRITE_FAILURE_MESSAGE,
      event: sanitizedEvent,
      persisted: false,
      writeFailed: true,
    };
  }
};
