-- Optional: run against Postgres when AGENT_PGVECTOR=true
-- Enables native vector index for agent_memories.embedding (if migrated to vector type).

CREATE EXTENSION IF NOT EXISTS vector;

-- Example migration after adding a `embedding_vector vector(256)` column:
-- CREATE INDEX IF NOT EXISTS agent_memories_embedding_idx
--   ON agent_memories USING ivfflat (embedding_vector vector_cosine_ops) WITH (lists = 50);
