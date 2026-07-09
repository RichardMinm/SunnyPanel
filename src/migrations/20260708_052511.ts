import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_posts_status" ADD VALUE 'archived';
  ALTER TYPE "public"."enum_notes_status" ADD VALUE 'archived';
  ALTER TYPE "public"."enum_updates_status" ADD VALUE 'archived';
  ALTER TYPE "public"."enum_checklists_status" ADD VALUE 'archived';
  ALTER TYPE "public"."enum_timeline_events_status" ADD VALUE 'archived';
  ALTER TYPE "public"."enum_plans_status" ADD VALUE 'archived';
  ALTER TYPE "public"."enum_pages_status" ADD VALUE 'archived';`)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  /* PostgreSQL does not support removing enum values.
   * Rollback strategy: the application-level default ("draft") +
   * status labels will handle the legacy value gracefully.
   * No data is lost — the column still accepts text values. */
}
