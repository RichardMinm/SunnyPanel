import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

const SUNNY_AGENT_GRAPH_VERSION = "v1";

export const buildSunnyAgentCheckpointConfig = ({
  threadId,
  userId,
}: {
  threadId: number;
  userId: number;
}) => ({
  configurable: {
    thread_id: `sunny-agent:${SUNNY_AGENT_GRAPH_VERSION}:${userId}:${threadId}`,
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
