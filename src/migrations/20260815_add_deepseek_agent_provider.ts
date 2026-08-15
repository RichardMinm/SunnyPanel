import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "agent_settings"
      ALTER COLUMN "provider" DROP DEFAULT;
    ALTER TYPE "public"."enum_agent_settings_provider"
      RENAME TO "enum_agent_settings_provider_without_deepseek";
    CREATE TYPE "public"."enum_agent_settings_provider"
      AS ENUM('deepseek', 'openai-compatible', 'openai', 'zai');
    ALTER TABLE "agent_settings"
      ALTER COLUMN "provider"
      TYPE "public"."enum_agent_settings_provider"
      USING "provider"::text::"public"."enum_agent_settings_provider";
    ALTER TABLE "agent_settings"
      ALTER COLUMN "provider" SET DEFAULT 'deepseek';
    DROP TYPE "public"."enum_agent_settings_provider_without_deepseek";
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    UPDATE "agent_settings"
    SET "provider" = 'openai-compatible'
    WHERE "provider"::text = 'deepseek';

    ALTER TABLE "agent_settings"
      ALTER COLUMN "provider" DROP DEFAULT;
    ALTER TYPE "public"."enum_agent_settings_provider"
      RENAME TO "enum_agent_settings_provider_with_deepseek";
    CREATE TYPE "public"."enum_agent_settings_provider"
      AS ENUM('openai-compatible', 'openai', 'zai');
    ALTER TABLE "agent_settings"
      ALTER COLUMN "provider"
      TYPE "public"."enum_agent_settings_provider"
      USING "provider"::text::"public"."enum_agent_settings_provider";
    ALTER TABLE "agent_settings"
      ALTER COLUMN "provider" SET DEFAULT 'openai-compatible';
    DROP TYPE "public"."enum_agent_settings_provider_with_deepseek";
  `);
}
