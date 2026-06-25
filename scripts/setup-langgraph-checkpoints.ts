import "dotenv/config";

import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import pg from "pg";

const connectionString = process.env.DATABASE_URL?.trim();

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is required before running agent:checkpoint:setup.",
  );
}

const pool = new pg.Pool({ connectionString });

try {
  const saver = new PostgresSaver(pool);
  await saver.setup();
  console.info("LangGraph checkpoint tables are ready.");
} finally {
  await pool.end();
}
