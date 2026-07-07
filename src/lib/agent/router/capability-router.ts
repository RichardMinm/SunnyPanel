/**
 * R6-C1-D-B: Legacy capability router retired.
 *
 * Previously imported parseCapabilityQueryIntent from intent/heuristics/query.
 * Now returns null — capability answers are handled by the controlled
 * capability answer path (buildCapabilityAnswerResponse).
 *
 * This file is kept as a retired shell for backward compatibility.
 * To be deleted in R6-C1-E.
 */

import type { LLMRouterOutput } from "./llm-router-schema";

export const routeCapabilityRouter = (_message: string): LLMRouterOutput | null => null;
