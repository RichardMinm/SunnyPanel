const DEBUG_LOG_BOOLEAN_VALUES = new Set(["1", "true", "yes", "on"]);

export const getAgentDebugLogPath = () => {
  const configuredPath = process.env.AGENT_DEBUG_LOG?.trim();

  if (!configuredPath || DEBUG_LOG_BOOLEAN_VALUES.has(configuredPath.toLowerCase())) {
    return ".agent-debug.log";
  }

  return configuredPath;
};
