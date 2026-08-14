import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TYPE "public"."enum_media_visibility" AS ENUM('private', 'public');
    ALTER TABLE "media" ADD COLUMN "visibility" "enum_media_visibility";
    UPDATE "media" SET "visibility" = 'public';
    ALTER TABLE "media" ALTER COLUMN "visibility" SET DEFAULT 'private';
    ALTER TABLE "media" ALTER COLUMN "visibility" SET NOT NULL;
    CREATE INDEX "media_visibility_idx" ON "media" USING btree ("visibility");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX "media_visibility_idx";
    ALTER TABLE "media" DROP COLUMN "visibility";
    DROP TYPE "public"."enum_media_visibility";
  `);
}
