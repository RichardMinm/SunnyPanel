/**
 * Phase LLM-R3: Build LLM-consumable tool catalog from the standardized
 * AgentToolRegistry (R2).
 *
 * The catalog contains metadata only — no function implementations,
 * raw code, or secrets.
 */

import { agentToolRegistry } from "../tool-registry";
import type { LLMToolCatalogEntry } from "./types";

export type BuildLLMToolCatalogOptions = {
  /** Include tools with capability "write" (default true). */
  includeWriteTools?: boolean;
  /** Include tools with capability "draft" (default true). */
  includeDraftTools?: boolean;
  /** Include tools with capability "read" (default true). */
  includeReadTools?: boolean;
  /** Truncate descriptions longer than this (0 = no truncation). */
  maxDescriptionLength?: number;
};

/**
 * Build a catalog of LLM-visible tools from the standardized registry.
 *
 * Only metadata is exposed — no function references, no database handles,
 * no secrets.
 */
export const buildLLMToolCatalog = (
  options: BuildLLMToolCatalogOptions = {},
): LLMToolCatalogEntry[] => {
  const {
    includeWriteTools = true,
    includeDraftTools = true,
    includeReadTools = true,
    maxDescriptionLength = 0,
  } = options;

  const entries: LLMToolCatalogEntry[] = [];

  for (const [_, tool] of Object.entries(agentToolRegistry)) {
    // Filter by capability
    if (tool.capability === "write" && !includeWriteTools) continue;
    if (tool.capability === "draft" && !includeDraftTools) continue;
    if (tool.capability === "read" && !includeReadTools) continue;

    const description =
      maxDescriptionLength > 0 && tool.description.length > maxDescriptionLength
        ? tool.description.slice(0, maxDescriptionLength) + "..."
        : tool.description;

    entries.push({
      name: tool.name,
      description,
      capability: tool.capability,
      riskLevel: tool.riskLevel,
      inputSchema: tool.inputSchema,
      canRunWithoutConfirmation: tool.canRunWithoutConfirmation,
      supportsDryRun: tool.supportsDryRun,
      supportsExecute: tool.supportsExecute,
      supportsRollback: tool.supportsRollback,
    });
  }

  return entries;
};
