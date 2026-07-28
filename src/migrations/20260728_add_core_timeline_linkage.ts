import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "timeline_events" ADD COLUMN "related_plan_id" integer;
    ALTER TABLE "timeline_events" ADD COLUMN "related_schedule_item_id" integer;
    ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_related_plan_id_plans_id_fk" FOREIGN KEY ("related_plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;
    ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_related_schedule_item_id_schedule_items_id_fk" FOREIGN KEY ("related_schedule_item_id") REFERENCES "public"."schedule_items"("id") ON DELETE set null ON UPDATE no action;
    CREATE INDEX "timeline_events_related_plan_idx" ON "timeline_events" USING btree ("related_plan_id");
    CREATE INDEX "timeline_events_related_schedule_item_idx" ON "timeline_events" USING btree ("related_schedule_item_id");

    UPDATE "timeline_events" AS "timeline_event"
    SET "related_plan_id" = "checklist"."plan_id"
    FROM "checklists" AS "checklist"
    WHERE "timeline_event"."related_checklist_id" = "checklist"."id"
      AND "checklist"."plan_id" IS NOT NULL;

    INSERT INTO "plans_rels" ("parent_id", "path", "timeline_events_id")
    SELECT "timeline_event"."related_plan_id", 'linkedContent', "timeline_event"."id"
    FROM "timeline_events" AS "timeline_event"
    WHERE "timeline_event"."related_plan_id" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "plans_rels" AS "existing_relation"
        WHERE "existing_relation"."parent_id" = "timeline_event"."related_plan_id"
          AND "existing_relation"."path" = 'linkedContent'
          AND "existing_relation"."timeline_events_id" = "timeline_event"."id"
      );
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "timeline_events" DROP CONSTRAINT "timeline_events_related_plan_id_plans_id_fk";
    ALTER TABLE "timeline_events" DROP CONSTRAINT "timeline_events_related_schedule_item_id_schedule_items_id_fk";
    DROP INDEX "timeline_events_related_plan_idx";
    DROP INDEX "timeline_events_related_schedule_item_idx";
    ALTER TABLE "timeline_events" DROP COLUMN "related_plan_id";
    ALTER TABLE "timeline_events" DROP COLUMN "related_schedule_item_id";
  `);
}
