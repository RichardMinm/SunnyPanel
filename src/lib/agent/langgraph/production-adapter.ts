import "server-only";

import { runBuildContextStep } from "@/lib/agent/chat-pipeline/build-context-step";
import { runDryRunAndProposeStep } from "@/lib/agent/chat-pipeline/dry-run-and-propose-step";
import { runExecuteAndPersistStep } from "@/lib/agent/chat-pipeline/execute-and-persist-step";
import { runOrchestrationStep } from "@/lib/agent/chat-pipeline/orchestration-step";
import { runResolveIntentStep } from "@/lib/agent/chat-pipeline/resolve-intent-step";
import type { RunAgentChatPipelineDeps } from "@/lib/agent/chat-pipeline/runtime-deps";
import {
  createRunFullLangGraphAgentChatPipeline,
  type FullLangGraphAdapterSteps,
} from "@/lib/agent/langgraph/full-adapter";
import { runAgentLearningLoop } from "@/lib/agent/learning-loop";
import { appendAgentThreadTurn } from "@/lib/agent/thread";

const productionSteps: FullLangGraphAdapterSteps = {
  appendAgentThreadTurn,
  runAgentLearningLoop,
  runBuildContextStep,
  runDryRunAndProposeStep,
  runExecuteAndPersistStep,
  runOrchestrationStep,
  runResolveIntentStep,
};

export const createRunProductionLangGraphAgentChatPipeline = (
  deps: RunAgentChatPipelineDeps,
) => createRunFullLangGraphAgentChatPipeline(deps, productionSteps);
