import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

import { PRODUCTION_GRAPH_VERSION } from "@/lib/agent/langgraph/topology";
import { buildSunnyAgentCheckpointThreadId } from "@/lib/agent/langgraph/checkpoint-lifecycle";

export const buildSunnyAgentCheckpointConfig = ({
  threadId,
  userId,
}: {
  threadId: number;
  userId: number;
}) => ({
  configurable: {
    thread_id: buildSunnyAgentCheckpointThreadId({
      threadId,
      userId,
      version: PRODUCTION_GRAPH_VERSION,
    }),
  },
  durability: "sync" as const,
});

export const createSunnyAgentPostgresSaver = (connectionString: string) => {
  if (!connectionString.trim()) {
    throw new Error(
      "DATABASE_URL is required to initialize the LangGraph PostgreSQL checkpointer.",
    );
  }

  return PostgresSaver.fromConnString(connectionString);
};

let productionSaver: PostgresSaver | null = null;

export const getSunnyAgentPostgresSaver = (
  env: Record<string, string | undefined> = process.env,
) => {
  if (!productionSaver) {
    productionSaver = createSunnyAgentPostgresSaver(env.DATABASE_URL ?? "");
  }

  return productionSaver;
};
