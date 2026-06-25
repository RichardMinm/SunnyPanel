import * as migration_20260623_add_writing_categories from "./20260623_add_writing_categories";
import * as migration_20260624_add_pages_summary from "./20260624_add_pages_summary";

export const migrations = [
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
];
