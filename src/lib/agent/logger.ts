type AgentLogLevel = "error" | "info" | "warn";

const isProduction = process.env.NODE_ENV === "production";

export const logAgentEvent = (
  level: AgentLogLevel,
  event: string,
  details: Record<string, unknown> = {},
) => {
  const payload = {
    at: new Date().toISOString(),
    component: "sunny-agent",
    event,
    ...details,
  };
  const serializedPayload = JSON.stringify(payload);

  if (level === "error") {
    console.error(serializedPayload);
    return;
  }

  if (level === "warn") {
    console.warn(serializedPayload);
    return;
  }

  if (!isProduction || details.persist === true) {
    console.info(serializedPayload);
  }
};
