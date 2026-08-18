import { createHash } from "node:crypto";

import type { StructuredProviderAttemptObserver } from "../llm/invoke-structured";
import type { ModelConfig } from "../llm/model-config";
import type { ModelFactory } from "../llm/model-factory";

export const buildLearningModelScope = (value: unknown): string =>
  `learning-candidate:${createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 16)}`;

export type LearningModelInvocationOptions = Readonly<{
  logicalCallAuthorizer?: (scopeId: string) => void;
  modelConfig?: ModelConfig;
  modelFactory?: ModelFactory;
  providerAttemptAuthorizer?: (attempt: number) => void;
  providerAttemptObserver?: StructuredProviderAttemptObserver;
  signal?: AbortSignal;
}>;
