import { sql } from "@payloadcms/db-postgres";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_agent_action_receipts_operation" AS ENUM('execute', 'rollback');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
      CREATE TYPE "public"."enum_agent_action_receipts_status" AS ENUM('pending', 'succeeded', 'failed', 'indeterminate');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
      CREATE TYPE "public"."enum_agent_thread_events_event_type" AS ENUM(
        'legacy_bootstrap',
        'user_received',
        'assistant_completed',
        'turn_failed',
        'projection_failed'
      );
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    CREATE TABLE IF NOT EXISTS "agent_action_receipts" (
      "id" serial PRIMARY KEY NOT NULL,
      "key" varchar NOT NULL,
      "action_id" varchar NOT NULL,
      "intent" varchar NOT NULL,
      "operation" "enum_agent_action_receipts_operation" DEFAULT 'execute' NOT NULL,
      "status" "enum_agent_action_receipts_status" DEFAULT 'pending' NOT NULL,
      "user_id" integer NOT NULL,
      "thread_id" integer NOT NULL,
      "response" jsonb,
      "rollback_payload" jsonb,
      "error" varchar,
      "completed_at" timestamp(3) with time zone,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "agent_thread_events" (
      "id" serial PRIMARY KEY NOT NULL,
      "event_key" varchar NOT NULL,
      "turn_id" varchar NOT NULL,
      "event_type" "enum_agent_thread_events_event_type" NOT NULL,
      "schema_version" numeric DEFAULT 1 NOT NULL,
      "thread_id" integer NOT NULL,
      "user_id" integer NOT NULL,
      "payload" jsonb NOT NULL,
      "recorded_at" timestamp(3) with time zone NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );

    ALTER TABLE "payload_locked_documents_rels"
      ADD COLUMN IF NOT EXISTS "agent_action_receipts_id" integer,
      ADD COLUMN IF NOT EXISTS "agent_thread_events_id" integer;

    DO $$ BEGIN
      ALTER TABLE "agent_action_receipts"
        ADD CONSTRAINT "agent_action_receipts_user_id_users_id_fk"
        FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
      ALTER TABLE "agent_action_receipts"
        ADD CONSTRAINT "agent_action_receipts_thread_id_agent_threads_id_fk"
        FOREIGN KEY ("thread_id") REFERENCES "public"."agent_threads"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
      ALTER TABLE "agent_thread_events"
        ADD CONSTRAINT "agent_thread_events_thread_id_agent_threads_id_fk"
        FOREIGN KEY ("thread_id") REFERENCES "public"."agent_threads"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
      ALTER TABLE "agent_thread_events"
        ADD CONSTRAINT "agent_thread_events_user_id_users_id_fk"
        FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels"
        ADD CONSTRAINT "payload_locked_documents_rels_agent_action_receipts_fk"
        FOREIGN KEY ("agent_action_receipts_id") REFERENCES "public"."agent_action_receipts"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    DO $$ BEGIN
      ALTER TABLE "payload_locked_documents_rels"
        ADD CONSTRAINT "payload_locked_documents_rels_agent_thread_events_fk"
        FOREIGN KEY ("agent_thread_events_id") REFERENCES "public"."agent_thread_events"("id") ON DELETE cascade ON UPDATE no action;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    CREATE UNIQUE INDEX IF NOT EXISTS "agent_action_receipts_key_idx" ON "agent_action_receipts" USING btree ("key");
    CREATE INDEX IF NOT EXISTS "agent_action_receipts_action_id_idx" ON "agent_action_receipts" USING btree ("action_id");
    CREATE INDEX IF NOT EXISTS "agent_action_receipts_user_idx" ON "agent_action_receipts" USING btree ("user_id");
    CREATE INDEX IF NOT EXISTS "agent_action_receipts_thread_idx" ON "agent_action_receipts" USING btree ("thread_id");
    CREATE INDEX IF NOT EXISTS "agent_action_receipts_updated_at_idx" ON "agent_action_receipts" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "agent_action_receipts_created_at_idx" ON "agent_action_receipts" USING btree ("created_at");

    CREATE UNIQUE INDEX IF NOT EXISTS "agent_thread_events_event_key_idx" ON "agent_thread_events" USING btree ("event_key");
    CREATE INDEX IF NOT EXISTS "agent_thread_events_turn_id_idx" ON "agent_thread_events" USING btree ("turn_id");
    CREATE INDEX IF NOT EXISTS "agent_thread_events_event_type_idx" ON "agent_thread_events" USING btree ("event_type");
    CREATE INDEX IF NOT EXISTS "agent_thread_events_thread_idx" ON "agent_thread_events" USING btree ("thread_id");
    CREATE INDEX IF NOT EXISTS "agent_thread_events_user_idx" ON "agent_thread_events" USING btree ("user_id");
    CREATE INDEX IF NOT EXISTS "agent_thread_events_recorded_at_idx" ON "agent_thread_events" USING btree ("recorded_at");
    CREATE INDEX IF NOT EXISTS "agent_thread_events_updated_at_idx" ON "agent_thread_events" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "agent_thread_events_created_at_idx" ON "agent_thread_events" USING btree ("created_at");

    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_agent_action_receipts_id_idx"
      ON "payload_locked_documents_rels" USING btree ("agent_action_receipts_id");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_agent_thread_events_id_idx"
      ON "payload_locked_documents_rels" USING btree ("agent_thread_events_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels"
      DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_agent_action_receipts_fk",
      DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_agent_thread_events_fk";

    ALTER TABLE "payload_locked_documents_rels"
      DROP COLUMN IF EXISTS "agent_action_receipts_id",
      DROP COLUMN IF EXISTS "agent_thread_events_id";

    DROP TABLE IF EXISTS "agent_action_receipts" CASCADE;
    DROP TABLE IF EXISTS "agent_thread_events" CASCADE;

    DROP TYPE IF EXISTS "public"."enum_agent_action_receipts_operation";
    DROP TYPE IF EXISTS "public"."enum_agent_action_receipts_status";
    DROP TYPE IF EXISTS "public"."enum_agent_thread_events_event_type";
  `);
}
