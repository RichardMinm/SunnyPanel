import type { OpenAIFunctionTool } from "../function-tools";
import { getCapability } from "./registry";
import type { AgentCapability } from "./types";

export const buildCapabilityFunctionTools = (allowedNames: readonly string[]): OpenAIFunctionTool[] =>
  allowedNames
    .map((name) => getCapability(name))
    .filter((cap): cap is AgentCapability => cap !== null && cap.exposableToLLM)
    .map((cap) => ({
      function: {
        description: cap.description,
        name: cap.name,
        parameters: cap.inputSchema as OpenAIFunctionTool["function"]["parameters"],
      },
      type: "function" as const,
    }));

export { intentFromCapabilityCall } from "./adapters";
