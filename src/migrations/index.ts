import * as migration_20260623_add_writing_categories from "./20260623_add_writing_categories";

export const migrations = [
  {
    up: migration_20260623_add_writing_categories.up,
    down: migration_20260623_add_writing_categories.down,
    name: "20260623_add_writing_categories",
  },
];
