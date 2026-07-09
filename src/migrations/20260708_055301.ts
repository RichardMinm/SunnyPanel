import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "checklists" ADD COLUMN "plan_id_id" integer;
  ALTER TABLE "checklists" ADD CONSTRAINT "checklists_plan_id_id_plans_id_fk" FOREIGN KEY ("plan_id_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "checklists_plan_id_idx" ON "checklists" USING btree ("plan_id_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "checklists" DROP CONSTRAINT "checklists_plan_id_id_plans_id_fk";

  DROP INDEX "checklists_plan_id_idx";
  ALTER TABLE "checklists" DROP COLUMN "plan_id_id";`)
}
