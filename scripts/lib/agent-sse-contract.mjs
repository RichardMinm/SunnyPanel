const contractFailure = (label, detail) => {
  throw new Error(`${label} ${detail}`);
};

export const parseAgentSseText = (text, label = "Agent SSE") =>
  text
    .split("\n\n")
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n");
      const event = lines
        .find((line) => line.startsWith("event:"))
        ?.slice("event:".length)
        .trim();
      const dataText = lines
        .find((line) => line.startsWith("data:"))
        ?.slice("data:".length)
        .trim();

      if (!event) {
        contractFailure(label, "contained a block without an event name");
      }

      let data = null;
      if (dataText) {
        try {
          data = JSON.parse(dataText);
        } catch {
          contractFailure(label, `contained invalid JSON for ${event}`);
        }
      }

      return { data, event };
    });

export const readAgentSseEvents = async (response, label = "Agent SSE") => {
  if (!response.body) {
    contractFailure(label, "response has no body");
  }

  return parseAgentSseText(await response.text(), label);
};

export const assertSuccessfulAgentSseEvents = (
  events,
  label = "Agent SSE",
) => {
  const terminalIndexes = events
    .map(({ event }, index) => event === "terminal" ? index : -1)
    .filter((index) => index >= 0);

  if (terminalIndexes.length !== 1) {
    contractFailure(
      label,
      `must include exactly one terminal event; received ${terminalIndexes.length}`,
    );
  }

  const doneIndex = events.findIndex(({ event }) => event === "done");
  if (doneIndex < 0) {
    contractFailure(label, "must include a done event before terminal");
  }

  const terminalIndex = terminalIndexes[0];
  if (doneIndex >= terminalIndex) {
    contractFailure(label, "must emit done before terminal");
  }

  if (terminalIndex !== events.length - 1) {
    contractFailure(label, "terminal must be the final event");
  }

  const terminal = events[terminalIndex]?.data;
  if (
    !terminal
    || typeof terminal !== "object"
    || terminal.status !== "complete"
    || terminal.persist !== true
  ) {
    contractFailure(label, "must end with status=complete and persist=true");
  }

  return terminal;
};
