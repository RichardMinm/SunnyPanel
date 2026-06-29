import * as migration_20260623_014012_langgraph_full_initial from "./20260623_014012_langgraph_full_initial";
import * as migration_20260623_add_writing_categories from "./20260623_add_writing_categories";
import * as migration_20260624_add_pages_summary from "./20260624_add_pages_summary";
import * as migration_20260625_add_agent_receipts_and_thread_events from "./20260625_add_agent_receipts_and_thread_events";
import * as migration_20260625_add_agent_thread_conversation_state from "./20260625_add_agent_thread_conversation_state";

export const migrations = [
  {
    up: migration_20260623_014012_langgraph_full_initial.up,
    down: migration_20260623_014012_langgraph_full_initial.down,
    name: "20260623_014012_langgraph_full_initial",
  },
  {
    up: migration_20260623_add_writing_categories.up,
    down: migration_20260623_add_writing_categories.down,
    name: "20260623_add_writing_categories",
  },
  {
    up: migration_20260624_add_pages_summary.up,
    down: migration_20260624_add_pages_summary.down,
    name: "20260624_add_pages_summary",
  },
  {
    up: migration_20260625_add_agent_receipts_and_thread_events.up,
    down: migration_20260625_add_agent_receipts_and_thread_events.down,
    name: "20260625_add_agent_receipts_and_thread_events",
  },
  {
    up: migration_20260625_add_agent_thread_conversation_state.up,
    down: migration_20260625_add_agent_thread_conversation_state.down,
    name: "20260625_add_agent_thread_conversation_state",
  },
];
