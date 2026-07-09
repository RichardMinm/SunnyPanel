import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "plans_rels" ADD COLUMN "schedule_items_id" integer;
  ALTER TABLE "plans_rels" ADD CONSTRAINT "plans_rels_schedule_items_fk" FOREIGN KEY ("schedule_items_id") REFERENCES "public"."schedule_items"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "plans_rels_schedule_items_id_idx" ON "plans_rels" USING btree ("schedule_items_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "plans_rels" DROP CONSTRAINT "plans_rels_schedule_items_fk";

  DROP INDEX "plans_rels_schedule_items_id_idx";
  ALTER TABLE "plans_rels" DROP COLUMN "schedule_items_id";`)
}
