import * as migration_20260623_014012_langgraph_full_initial from './20260623_014012_langgraph_full_initial';

export const migrations = [
  {
    up: migration_20260623_014012_langgraph_full_initial.up,
    down: migration_20260623_014012_langgraph_full_initial.down,
    name: '20260623_014012_langgraph_full_initial'
  },
];
