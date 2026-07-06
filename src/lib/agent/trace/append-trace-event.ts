import { sanitizeAgentTraceEvent } from "./sanitize";
import type {
  AppendAgentTraceEventInput,
  AppendAgentTraceEventResult,
} from "./types";

const errorMessageFor = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

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
      errorMessage: errorMessageFor(error),
      event: sanitizedEvent,
      persisted: false,
      writeFailed: true,
    };
  }
};
